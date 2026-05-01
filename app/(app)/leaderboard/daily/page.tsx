"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getDayId, getDayLabel } from "@/lib/day";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type SportTab = "NBA" | "MLB" | "MIXED";

type LeaderboardEntry = {
  uid: string;
  displayName?: string | null;
  username?: string | null;
  totalPoints: number;
  wins: number;
  losses: number;
  pushes: number;
  totalPicks: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name?: string | null) {
  const s = (name ?? "?").trim();
  return s.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function winRate(e: LeaderboardEntry) {
  const r = e.wins + e.losses + e.pushes;
  return r > 0 ? Math.round((e.wins / r) * 100) : 0;
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function offsetDayId(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

const SPORT_CONFIG: Record<SportTab, { color: string; border: string; activeBg: string; accent: string }> = {
  NBA:   { color: "text-blue-300",   border: "border-blue-400/30",   activeBg: "bg-blue-500/15",   accent: "#3B82F6" },
  MLB:   { color: "text-sky-300",    border: "border-sky-400/30",    activeBg: "bg-sky-500/15",    accent: "#38BDF8" },
  MIXED: { color: "text-violet-300", border: "border-violet-400/30", activeBg: "bg-violet-500/15", accent: "#8B5CF6" },
};

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({
  uid, name, size = "md", avatarUrls, isMe, rank,
}: {
  uid: string; name: string; size?: "sm" | "md" | "lg";
  avatarUrls: Record<string, string>; isMe: boolean; rank: number;
}) {
  const url = avatarUrls[uid];
  const dim = size === "lg" ? "h-14 w-14" : size === "md" ? "h-10 w-10" : "h-8 w-8";
  const txt = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs";
  const borderCls = isMe
    ? "border-emerald-400/60 ring-1 ring-emerald-400/20"
    : rank === 1 ? "border-amber-400/60"
    : rank === 2 ? "border-slate-400/40"
    : rank === 3 ? "border-orange-400/40"
    : "border-white/12";
  const bgCls = isMe ? "bg-emerald-500/15" : rank === 1 ? "bg-amber-400/12" : rank === 2 ? "bg-slate-400/10" : rank === 3 ? "bg-orange-400/10" : "bg-white/[0.04]";
  const textCls = isMe ? "text-emerald-300" : rank === 1 ? "text-amber-300" : rank === 2 ? "text-slate-300" : rank === 3 ? "text-orange-300" : "text-white/50";

  if (url) {
    return (
      <img src={url} alt={name}
        className={`${dim} rounded-xl border-2 object-cover ${borderCls}`}
        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border-2 font-black ${txt} ${borderCls} ${bgCls} ${textCls}`}>
      {initials(name)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyLeaderboardPage() {
  const { user } = useAuth();

  const [dayOffset,   setDayOffset]   = useState(0);
  const [sport,       setSport]       = useState<SportTab>("NBA");
  const [entries,     setEntries]     = useState<LeaderboardEntry[]>([]);
  const [enriched,    setEnriched]    = useState<LeaderboardEntry[]>([]);
  const [avatarUrls,  setAvatarUrls]  = useState<Record<string, string>>({});
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);
  const [userPlan,    setUserPlan]    = useState("free");
  const [qText,       setQText]       = useState("");
  const unsubRef = useRef<(() => void) | null>(null);

  const activeDayId    = useMemo(() => offsetDayId(dayOffset), [dayOffset]);
  const activeDayLabel = useMemo(() => getDayLabel(activeDayId, "es-PR"), [activeDayId]);
  const isToday        = dayOffset === 0;
  const isPremium      = userPlan === "premium";
  const TABS: SportTab[] = isPremium ? ["NBA", "MLB", "MIXED"] : ["NBA", "MLB"];

  // Load user plan
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setUserPlan((snap.data() as any)?.plan ?? "free");
    });
  }, [user?.uid]);

  // ── Aggregate picks_daily into leaderboard entries ──
  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    setLoading(true);
    setErr(null);
    setEntries([]);
    let cancelled = false;

    const sports = sport === "MIXED" ? ["NBA", "MLB"] : [sport];
    const allPicks: any[][] = sports.map(() => []);
    const unsubs: (() => void)[] = [];

    function aggregate(picks: any[]): LeaderboardEntry[] {
      const map = new Map<string, LeaderboardEntry>();
      for (const p of picks) {
        const uid = p.uid ?? p.userId;
        if (!uid) continue;
        const e = map.get(uid) ?? { uid, displayName: p.displayName ?? null, username: p.username ?? null, totalPoints: 0, wins: 0, losses: 0, pushes: 0, totalPicks: 0 };
        e.totalPicks++;
        if (p.result === "win")  { e.wins++;   e.totalPoints += p.pointsAwarded ?? 100; }
        if (p.result === "push") { e.pushes++; e.totalPoints += p.pointsAwarded ?? 50;  }
        if (p.result === "loss") { e.losses++; }
        if (p.displayName && !e.displayName) e.displayName = p.displayName;
        if (p.username    && !e.username)    e.username    = p.username;
        map.set(uid, e);
      }
      return [...map.values()].sort((a, b) => b.totalPoints - a.totalPoints);
    }

    const merge = () => { if (!cancelled) { setEntries(aggregate(allPicks.flat())); setLoading(false); } };

    sports.forEach((s, i) => {
      const q = query(collection(db, "picks_daily"), where("dayId", "==", activeDayId), where("sport", "==", s));
      const unsub = onSnapshot(q,
        snap => { if (!cancelled) { allPicks[i] = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); } },
        e    => { if (!cancelled) { setErr(String((e as any)?.message ?? e)); setLoading(false); } }
      );
      unsubs.push(unsub);
    });

    unsubRef.current = () => { cancelled = true; unsubs.forEach(u => u()); };
    return () => { cancelled = true; unsubRef.current?.(); unsubRef.current = null; };
  }, [activeDayId, sport]);

  // ── Enrich missing usernames ──
  useEffect(() => {
    if (entries.length === 0) { setEnriched([]); return; }
    const needsLookup = entries.filter(e => !e.displayName && !e.username);
    if (needsLookup.length === 0) { setEnriched(entries); return; }
    let alive = true;
    (async () => {
      const { getDocs: gd, query: fsQ, collection: fsCol, where: fsWhere } = await import("firebase/firestore");
      const uids = needsLookup.map(e => e.uid).filter(Boolean);
      const nameMap: Record<string, string> = {};
      for (let i = 0; i < uids.length; i += 10) {
        try {
          const snap = await gd(fsQ(fsCol(db, "usernames"), fsWhere("uid", "in", uids.slice(i, i + 10))));
          snap.forEach(d => { const data = d.data() as any; nameMap[data.uid ?? d.id] = data.username ?? d.id; });
        } catch { /* ignore */ }
      }
      if (!alive) return;
      setEnriched(entries.map(e => ({ ...e, username: e.username ?? nameMap[e.uid] ?? null, displayName: e.displayName ?? nameMap[e.uid] ?? null })));
    })();
    return () => { alive = false; };
  }, [entries]);

  // ── Batch-fetch avatar URLs ──
  useEffect(() => {
    const rows = enriched.length > 0 ? enriched : entries;
    if (rows.length === 0) return;
    let alive = true;
    (async () => {
      const uids = rows.map(r => r.uid).filter(Boolean);
      const urls: Record<string, string> = {};
      for (let i = 0; i < uids.length; i += 10) {
        try {
          const snap = await getDocs(query(collection(db, "users"), where(documentId(), "in", uids.slice(i, i + 10))));
          snap.forEach(d => {
            const av = (d.data() as any)?.avatarUrl;
            if (av) urls[d.id] = av;
          });
        } catch { /* ignore */ }
      }
      if (alive) setAvatarUrls(urls);
    })();
    return () => { alive = false; };
  }, [enriched, entries]);

  const display  = useMemo(() => enriched.length > 0 ? enriched : entries, [enriched, entries]);
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return !t ? display : display.filter(e => (e.displayName ?? e.username ?? "").toLowerCase().includes(t));
  }, [display, qText]);

  const myIndex = display.findIndex(e => e.uid === user?.uid);
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const myEntry = myIndex >= 0 ? display[myIndex] : null;
  const cfg     = SPORT_CONFIG[sport];

  return (
    <Protected>
      <div className="px-3 md:px-6 py-4">
        <div className="mx-auto max-w-3xl">

          {/* ── Page title ── */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/8 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                <span className={["inline-flex h-1.5 w-1.5 rounded-full", isToday ? "bg-amber-400 animate-pulse" : "bg-white/30"].join(" ")} />
                {isToday ? "Live" : "Histórico"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Daily Leaderboard</h1>
          </div>

          {/* ── Day navigator ── */}
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-2 py-1.5">
            <button onClick={() => setDayOffset(v => v - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 hover:bg-white/8 hover:text-white transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">{activeDayId}</span>
              <span className="text-sm font-semibold text-white">{activeDayLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              {dayOffset !== 0 && (
                <button onClick={() => setDayOffset(0)} className="rounded-lg px-2.5 py-1 text-xs text-white/35 hover:bg-white/8 hover:text-white/60 transition">Hoy</button>
              )}
              <button onClick={() => setDayOffset(v => Math.min(v + 1, 0))} disabled={isToday}
                className={["flex h-8 w-8 items-center justify-center rounded-xl transition",
                  isToday ? "text-white/15 cursor-default" : "text-white/40 hover:bg-white/8 hover:text-white"].join(" ")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          {/* ── Sport selector + Weekly links + Search ── */}
          <div className="mb-4 flex flex-col gap-3">
            {/* Sport tabs */}
            <div className="flex items-center gap-2">
              {/* Segmented control for daily sports */}
              <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 gap-1">
                {TABS.map(s => {
                  const c = SPORT_CONFIG[s];
                  const active = sport === s;
                  return (
                    <button key={s} onClick={() => setSport(s)}
                      className={[
                        "rounded-lg px-4 py-1.5 text-xs font-bold tracking-wide transition",
                        active ? `${c.activeBg} ${c.color} shadow-sm` : "text-white/40 hover:text-white/70",
                      ].join(" ")}>
                      {s === "MIXED" ? "🏆 Mixed" : s}
                    </button>
                  );
                })}
              </div>

              {!isPremium && (
                <Link href="/subscription"
                  className="flex items-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-400/60 hover:text-violet-300 hover:bg-violet-500/10 transition">
                  🏆 Mixed
                  <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-1.5 py-px text-[8px] font-black text-amber-300/70 uppercase tracking-wider">PRO</span>
                </Link>
              )}

              {/* Search — right side */}
              <div className="ml-auto">
                <input value={qText} onChange={e => setQText(e.target.value)} placeholder="Buscar…"
                  className="w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20" />
              </div>
            </div>

            {/* Weekly leaderboard links */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 uppercase tracking-wider">Semana →</span>
              <Link href="/leaderboard/nba"
                className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/45 hover:bg-white/8 hover:text-white/80 transition">
                🏀 NBA Weekly
              </Link>
              <Link href="/leaderboard/mlb"
                className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/45 hover:bg-white/8 hover:text-white/80 transition">
                ⚾ MLB Weekly
              </Link>
            </div>
          </div>

          {/* ── My Position Banner ── */}
          {myEntry && (
            <div className="mb-4 relative overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-3">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-emerald-400/70" />
              <div className="flex items-center gap-3 pl-2">
                <Avatar uid={myEntry.uid} name={myEntry.displayName ?? myEntry.username ?? "Yo"} size="md" avatarUrls={avatarUrls} isMe rank={myRank!} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">Tu posición</span>
                    <span className="text-xs font-bold text-white/60">{medal(myRank!)}</span>
                    <span className="text-[11px] text-white/35">de {display.length}</span>
                  </div>
                  <div className="text-[11px] text-white/45 mt-0.5">
                    <span className="text-emerald-400/80 font-bold">{myEntry.wins}W</span>
                    <span className="text-white/20"> · </span>
                    <span className="text-red-400/70 font-bold">{myEntry.losses}L</span>
                    <span className="text-white/20"> · </span>
                    <span className="text-yellow-400/60 font-bold">{myEntry.pushes}P</span>
                    <span className="text-white/20"> · </span>
                    <span className="text-white/40">{winRate(myEntry)}% WR</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-black text-emerald-300 tabular-nums">{myEntry.totalPoints.toLocaleString()}</div>
                  <div className="text-[10px] text-white/30">pts</div>
                </div>
              </div>
            </div>
          )}

          {err && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">{err}</div>
          )}

          {/* ── Podium Top 3 ── */}
          {!loading && filtered.length >= 1 && (
            <div className="mb-4 rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25">Top 3 · {activeDayId}</div>
                {isToday && <span className="text-[10px] text-amber-400/60 font-bold animate-pulse">● Live</span>}
              </div>

              <div className="flex items-end justify-center gap-4 px-4 pb-0 pt-2">

                {/* #2 Silver */}
                {filtered[1] && (() => {
                  const r = filtered[1]; const wr = winRate(r); const isMe = user?.uid === r.uid;
                  const name = (r.displayName || r.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <Avatar uid={r.uid} name={name} size="md" avatarUrls={avatarUrls} isMe={isMe} rank={2} />
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[72px] ${isMe ? "text-emerald-300" : "text-white/80"}`}>{name.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{r.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-400 font-bold">{r.wins}W</span>
                          <span className="text-white/20"> · </span>
                          <span className="text-red-400">{r.losses}L</span>
                        </div>
                      </div>
                      <div className="w-full h-16 rounded-t-xl bg-gradient-to-t from-slate-500/25 to-slate-400/5 border border-slate-400/15 border-b-0 flex items-center justify-center">
                        <span className="text-xl">🥈</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #1 Gold */}
                {filtered[0] && (() => {
                  const r = filtered[0]; const wr = winRate(r); const isMe = user?.uid === r.uid;
                  const name = (r.displayName || r.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className="text-sm">👑</div>
                      <Avatar uid={r.uid} name={name} size="lg" avatarUrls={avatarUrls} isMe={isMe} rank={1} />
                      <div className="text-center">
                        <div className={`text-sm font-black truncate max-w-[80px] ${isMe ? "text-emerald-300" : "text-white"}`}>{name.split(" ")[0]}</div>
                        <div className="text-[11px] font-bold text-amber-300">{r.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-400 font-bold">{r.wins}W</span>
                          <span className="text-white/20"> · </span>
                          <span className="text-red-400">{r.losses}L</span>
                        </div>
                      </div>
                      <div className="w-full h-24 rounded-t-xl bg-gradient-to-t from-amber-500/25 to-amber-400/5 border border-amber-400/20 border-b-0 flex items-center justify-center">
                        <span className="text-2xl">🥇</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #3 Bronze */}
                {filtered[2] && (() => {
                  const r = filtered[2]; const wr = winRate(r); const isMe = user?.uid === r.uid;
                  const name = (r.displayName || r.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <Avatar uid={r.uid} name={name} size="sm" avatarUrls={avatarUrls} isMe={isMe} rank={3} />
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[64px] ${isMe ? "text-emerald-300" : "text-white/70"}`}>{name.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{r.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-400 font-bold">{r.wins}W</span>
                          <span className="text-white/20"> · </span>
                          <span className="text-red-400">{r.losses}L</span>
                        </div>
                      </div>
                      <div className="w-full h-10 rounded-t-xl bg-gradient-to-t from-orange-500/15 to-orange-400/5 border border-orange-400/15 border-b-0 flex items-center justify-center">
                        <span className="text-lg">🥉</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Table ── */}
          <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[40px_1fr_60px_auto] md:grid-cols-[56px_1fr_72px_110px_90px] gap-2 border-b border-white/8 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
              <div>#</div>
              <div>Jugador</div>
              <div className="text-center">Win%</div>
              <div className="text-right">Record</div>
              <div className="hidden md:block text-right">Pts</div>
            </div>

            {loading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/4" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm font-semibold text-white/60">Sin rankings aún</div>
                <div className="text-xs text-white/30 mt-1">Los rankings aparecen cuando los picks se resuelven.</div>
                <Link href="/tournaments/daily"
                  className="mt-4 inline-block rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60 hover:bg-white/10 transition">
                  Hacer picks →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {filtered.map((entry, idx) => {
                  const rank  = idx + 1;
                  const isMe  = entry.uid === user?.uid;
                  const top3  = rank <= 3;
                  const wr    = winRate(entry);
                  const name  = entry.displayName ?? entry.username ?? "User";
                  const accentColor =
                    isMe   ? "#10B981"
                    : rank === 1 ? "#F59E0B"
                    : rank === 2 ? "#94A3B8"
                    : rank === 3 ? "#FB923C"
                    : "transparent";

                  return (
                    <div key={entry.uid}
                      className={[
                        "relative grid grid-cols-[40px_1fr_60px_auto] md:grid-cols-[56px_1fr_72px_110px_90px] gap-2 px-4 py-3 transition-colors items-center",
                        isMe ? "bg-emerald-500/6" : "hover:bg-white/[0.02]",
                      ].join(" ")}
                    >
                      {/* Left accent bar */}
                      <div className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full"
                        style={{ backgroundColor: accentColor, opacity: accentColor === "transparent" ? 0 : (isMe ? 0.7 : 0.5) }} />

                      {/* Rank */}
                      <div className="pl-1 text-xs font-bold text-white/50">{medal(rank)}</div>

                      {/* Player */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar uid={entry.uid} name={name} size="sm" avatarUrls={avatarUrls} isMe={isMe} rank={rank} />
                        <div className="min-w-0">
                          <div className={["truncate text-xs font-semibold", isMe ? "text-emerald-300" : top3 ? "text-white/90" : "text-white/70"].join(" ")}>
                            {name}
                          </div>
                          <div className="md:hidden text-[10px] text-white/30 tabular-nums">{entry.totalPoints.toLocaleString()} pts</div>
                        </div>
                      </div>

                      {/* Win rate */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-white/55 tabular-nums">{wr}%</span>
                        <div className="h-1 w-10 rounded-full bg-white/8 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/50" style={{ width: `${wr}%` }} />
                        </div>
                      </div>

                      {/* Record */}
                      <div className="flex items-center justify-end gap-1 text-[11px] font-bold tabular-nums">
                        <span className="text-emerald-400">{entry.wins}W</span>
                        <span className="text-white/18"> · </span>
                        <span className="text-red-400">{entry.losses}L</span>
                        {entry.pushes > 0 && (
                          <>
                            <span className="text-white/18"> · </span>
                            <span className="text-yellow-400">{entry.pushes}P</span>
                          </>
                        )}
                      </div>

                      {/* Points desktop */}
                      <div className={["hidden md:flex items-center justify-end text-sm font-black tabular-nums",
                        isMe ? "text-emerald-300" : top3 ? "text-white" : "text-white/55"].join(" ")}>
                        {entry.totalPoints.toLocaleString()}
                        <span className="ml-1 text-[10px] font-normal text-white/25">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-[10px] text-white/20">
            <span>Win 100 · Push 50 · Loss 0 · {activeDayId}</span>
            <span>{filtered.length} jugador{filtered.length !== 1 ? "es" : ""}</span>
          </div>

        </div>
      </div>
    </Protected>
  );
}
