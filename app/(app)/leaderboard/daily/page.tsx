"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getDayId, getDayLabel } from "@/lib/day";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyLeaderboardPage() {
  const { user } = useAuth();

  const [dayOffset,  setDayOffset]  = useState(0);
  const [sport,      setSport]      = useState<SportTab>("NBA");
  const [entries,    setEntries]    = useState<LeaderboardEntry[]>([]);
  const [enriched,   setEnriched]   = useState<LeaderboardEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);
  const [userPlan,   setUserPlan]   = useState("free");
  const [qText,      setQText]      = useState("");
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
      const { getDocs, query: fsQ, collection: fsCol, where: fsWhere } = await import("firebase/firestore");
      const uids = needsLookup.map(e => e.uid).filter(Boolean);
      const nameMap: Record<string, string> = {};
      for (let i = 0; i < uids.length; i += 10) {
        try {
          const snap = await getDocs(fsQ(fsCol(db, "usernames"), fsWhere("uid", "in", uids.slice(i, i + 10))));
          snap.forEach(d => { const data = d.data() as any; nameMap[data.uid ?? d.id] = data.username ?? d.id; });
        } catch { /* ignore */ }
      }
      if (!alive) return;
      setEnriched(entries.map(e => ({ ...e, username: e.username ?? nameMap[e.uid] ?? null, displayName: e.displayName ?? nameMap[e.uid] ?? null })));
    })();
    return () => { alive = false; };
  }, [entries]);

  const display = useMemo(() => enriched.length > 0 ? enriched : entries, [enriched, entries]);
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return !t ? display : display.filter(e => (e.displayName ?? e.username ?? "").toLowerCase().includes(t));
  }, [display, qText]);

  const myIndex = display.findIndex(e => e.uid === user?.uid);
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const myEntry = myIndex >= 0 ? display[myIndex] : null;

  return (
    <Protected>
      <div className="px-4 md:px-8 py-6">
        <div className="mx-auto max-w-5xl">

          {/* ── Header ── */}
          <div className="mb-6">
            <div className="flex flex-col gap-1 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">Daily Leaderboard</h1>
                {isToday ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/8 px-3 py-1 text-xs font-semibold text-amber-300/80">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/40">
                    Histórico
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">{activeDayLabel}</span>
              </div>
              <p className="text-white/50 text-sm">Rankings actualizan cuando los juegos van <span className="text-white/80">FINAL</span>.</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Day navigation */}
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                <button onClick={() => setDayOffset(v => v - 1)}
                  className="px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition border-r border-white/8">
                  ← Prev
                </button>
                <button onClick={() => setDayOffset(0)} disabled={isToday}
                  className={["px-4 py-2 text-sm transition border-r border-white/8", isToday ? "text-white/20 cursor-default" : "text-white/60 hover:bg-white/5 hover:text-white/90"].join(" ")}>
                  Hoy
                </button>
                <button onClick={() => setDayOffset(v => Math.min(v + 1, 0))} disabled={isToday}
                  className={["px-3 py-2 text-sm transition", isToday ? "text-white/20 cursor-default" : "text-white/60 hover:bg-white/5 hover:text-white/90"].join(" ")}>
                  Next →
                </button>
              </div>
              <input value={qText} onChange={e => setQText(e.target.value)} placeholder="Buscar jugador..."
                className="w-full md:w-52 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20" />
            </div>
          </div>

          {/* ── Sport + nav tabs ── */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {/* Sport toggle */}
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              {TABS.map((s, i) => {
                const c = SPORT_CONFIG[s];
                const active = sport === s;
                return (
                  <button key={s} onClick={() => setSport(s)}
                    className={[
                      "px-4 py-2 text-sm font-semibold transition",
                      i > 0 ? "border-l border-white/8" : "",
                      active ? `${c.activeBg} ${c.color}` : "text-white/55 hover:bg-white/5 hover:text-white/90",
                    ].join(" ")}>
                    {s === "MIXED" ? "🏆 Mixed" : s}
                  </button>
                );
              })}
            </div>
            {!isPremium && (
              <div className="flex items-center gap-2 rounded-xl border border-violet-400/15 bg-violet-500/5 px-4 py-2">
                <span className="text-xs text-violet-400/60">🏆 Mixed</span>
                <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300/70 uppercase tracking-wider">Premium</span>
                <Link href="/subscription" className="text-[10px] text-violet-400/50 hover:text-violet-300 transition">Upgrade →</Link>
              </div>
            )}
            {/* Weekly links */}
            <div className="ml-auto flex items-center gap-2">
              <Link href="/leaderboard/nba"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60 hover:bg-white/5 transition">
                Weekly NBA
              </Link>
              <Link href="/leaderboard/mlb"
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60 hover:bg-white/5 transition">
                Weekly MLB
              </Link>
            </div>
          </div>

          {/* ── My stats cards ── */}
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Players",   val: filtered.length,                                                     sub: "en este día" },
              { label: "Tu Rank",   val: myRank ? medal(myRank) : "—",                                       sub: myRank ? `${myRank} de ${filtered.length}` : "No rankeado" },
              { label: "Your points", val: myEntry ? `${myEntry.totalPoints.toLocaleString()} pts` : "—",    sub: isToday ? "hoy" : activeDayLabel },
              { label: "Win Rate",  val: myEntry ? `${winRate(myEntry)}%` : "—",                             sub: myEntry ? `${myEntry.wins}W-${myEntry.losses}L-${myEntry.pushes}P` : "Sin picks" },
            ].map(({ label, val, sub }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs text-white/50 mb-1">{label}</div>
                <div className="text-xl font-bold text-white tabular-nums">{val}</div>
                <div className="text-xs text-white/35 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {err && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">{err}</div>
          )}

          {/* ── Podium Top 3 ── */}
          {!loading && filtered.length >= 1 && (
            <div className="mb-5 rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-white/30">Top 3 hoy</div>
                <div className="text-xs text-white/20">{activeDayId}</div>
              </div>

              <div className="flex items-end justify-center gap-3 px-4 pb-0 pt-2">

                {/* #2 Silver */}
                {filtered[1] && (() => {
                  const r2 = filtered[1]; const wr2 = winRate(r2); const isMe2 = user?.uid === r2.uid;
                  const name2 = (r2.displayName || r2.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-sm font-black ${isMe2 ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-slate-400/40 bg-slate-400/10 text-slate-300"}`}>{initials(name2)}</div>
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[72px] ${isMe2 ? "text-emerald-300" : "text-white/80"}`}>{name2.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{r2.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[11px] font-black text-slate-300 mt-0.5">{wr2}%</div>
                        <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-slate-400/60" style={{ width: `${wr2}%` }} />
                        </div>
                        <div className="text-[9px] text-white/30 mt-1">
                          <span className="text-emerald-400/70">{r2.wins}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{r2.losses}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/50">{r2.pushes}P</span>
                        </div>
                      </div>
                      <div className="w-full h-16 rounded-t-xl bg-gradient-to-t from-slate-500/30 to-slate-400/10 border border-slate-400/20 border-b-0 flex items-center justify-center">
                        <span className="text-xl">🥈</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #1 Gold — tallest */}
                {filtered[0] && (() => {
                  const r1 = filtered[0]; const wr1 = winRate(r1); const isMe1 = user?.uid === r1.uid;
                  const name1 = (r1.displayName || r1.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className="text-sm">👑</div>
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-base font-black ${isMe1 ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-amber-400/60 bg-amber-400/15 text-amber-300"}`}>{initials(name1)}</div>
                      <div className="text-center">
                        <div className={`text-sm font-black truncate max-w-[80px] ${isMe1 ? "text-emerald-300" : "text-white"}`}>{name1.split(" ")[0]}</div>
                        <div className="text-[11px] font-bold text-amber-300">{r1.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[12px] font-black text-amber-300 mt-0.5">{wr1}%</div>
                        <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${wr1}%` }} />
                        </div>
                        <div className="text-[9px] text-white/40 mt-1">
                          <span className="text-emerald-400/80">{r1.wins}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{r1.losses}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/60">{r1.pushes}P</span>
                        </div>
                      </div>
                      <div className="w-full h-24 rounded-t-xl bg-gradient-to-t from-amber-500/30 to-amber-400/10 border border-amber-400/25 border-b-0 flex items-center justify-center">
                        <span className="text-2xl">🥇</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #3 Bronze */}
                {filtered[2] && (() => {
                  const r3 = filtered[2]; const wr3 = winRate(r3); const isMe3 = user?.uid === r3.uid;
                  const name3 = (r3.displayName || r3.username || "User").trim();
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border-2 text-xs font-black ${isMe3 ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-orange-400/40 bg-orange-400/10 text-orange-300"}`}>{initials(name3)}</div>
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[64px] ${isMe3 ? "text-emerald-300" : "text-white/70"}`}>{name3.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{r3.totalPoints.toLocaleString()} pts</div>
                        <div className="text-[10px] font-black text-orange-300 mt-0.5">{wr3}%</div>
                        <div className="w-10 h-1 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-orange-400/60" style={{ width: `${wr3}%` }} />
                        </div>
                        <div className="text-[9px] text-white/30 mt-1">
                          <span className="text-emerald-400/70">{r3.wins}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{r3.losses}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/50">{r3.pushes}P</span>
                        </div>
                      </div>
                      <div className="w-full h-10 rounded-t-xl bg-gradient-to-t from-orange-500/20 to-orange-400/8 border border-orange-400/20 border-b-0 flex items-center justify-center">
                        <span className="text-lg">🥉</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mx-4" />
              <div className="px-4 py-2 text-[10px] text-white/18 text-center tracking-widest uppercase">
                Win Rate · W · L · P · Puntos
              </div>
            </div>
          )}

          {/* ── Table ── */}
          <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_60px_100px] md:grid-cols-[56px_1fr_80px_120px_100px] gap-2 md:gap-3 border-b border-white/10 bg-black/30 px-3 md:px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">
              <div>Rank</div>
              <div>Player</div>
              <div className="text-center">Win%</div>
              <div className="text-right">Record</div>
              <div className="hidden md:block text-right">Points</div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 m-4">
                <div className="text-lg font-semibold">No rankings yet</div>
                <div className="mt-1 text-white/60 text-sm">
                  Los rankings aparecen cuando los picks del día se resuelven (status <span className="text-white/80 font-medium">FINAL</span>).
                </div>
                <div className="mt-4">
                  <Link href="/tournaments/daily" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 transition">
                    Hacer picks →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {filtered.map((entry, idx) => {
                  const rank = idx + 1;
                  const isMe = entry.uid === user?.uid;
                  const top3 = rank <= 3;
                  const wr   = winRate(entry);
                  const name = entry.displayName ?? entry.username ?? "User";

                  return (
                    <div key={entry.uid}
                      className={[
                        "grid grid-cols-[40px_1fr_60px_100px] md:grid-cols-[56px_1fr_80px_120px_100px] gap-2 md:gap-3 px-3 md:px-4 py-3.5 text-sm transition-colors",
                        isMe ? "bg-emerald-500/8" : "bg-black/20 hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      {/* Rank */}
                      <div className="flex items-center text-white/70 font-semibold text-xs md:text-sm">
                        {medal(rank)}
                      </div>

                      {/* Player */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={[
                          "flex h-8 w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                          isMe ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                               : top3 ? "border-white/15 bg-white/8 text-white/70"
                               : "border-white/8 bg-white/5 text-white/40",
                        ].join(" ")}>
                          {initials(name)}
                        </div>
                        <div className="min-w-0">
                          <div className={["truncate text-xs md:text-sm font-medium", isMe ? "text-emerald-300" : "text-white/80"].join(" ")}>
                            {name}
                          </div>
                          <div className="hidden md:block truncate text-xs text-white/35">
                            @{(entry.username ?? name).toLowerCase().replace(/\s+/g, "")}
                          </div>
                          {/* Points shown inline on mobile */}
                          <div className="md:hidden text-xs text-white/40 tabular-nums">
                            {entry.totalPoints.toLocaleString()} pts
                          </div>
                        </div>
                      </div>

                      {/* Win rate */}
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-xs font-semibold text-white/60 tabular-nums">{wr}%</span>
                        <div className="h-1 w-8 md:w-12 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/50" style={{ width: `${wr}%` }} />
                        </div>
                      </div>

                      {/* Record */}
                      <div className="flex items-center justify-end gap-1 text-xs tabular-nums">
                        <span className="font-semibold text-green-400/80">{entry.wins}W</span>
                        <span className="text-white/20">·</span>
                        <span className="font-semibold text-red-400/70">{entry.losses}L</span>
                        <span className="text-white/20 hidden md:inline">·</span>
                        <span className="font-semibold text-yellow-400/60 hidden md:inline">{entry.pushes}P</span>
                      </div>

                      {/* Points — desktop only */}
                      <div className={[
                        "hidden md:flex items-center justify-end text-sm font-bold tabular-nums",
                        isMe ? "text-emerald-300" : top3 ? "text-white" : "text-white/60",
                      ].join(" ")}>
                        {entry.totalPoints.toLocaleString()}
                        <span className="ml-1 text-xs font-normal text-white/30">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-white/25">
            <span>Win 100 · Push 50 · Loss 0 · Día {activeDayId}</span>
            <span>{filtered.length} jugador{filtered.length !== 1 ? "es" : ""}</span>
          </div>

        </div>
      </div>
    </Protected>
  );
}
