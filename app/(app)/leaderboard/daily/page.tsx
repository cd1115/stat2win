"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getDayId, getDayLabel } from "@/lib/day";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

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

function initials(name?: string | null) {
  const s = (name ?? "?").trim();
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function winRate(e: LeaderboardEntry) {
  const r = e.wins + e.losses + e.pushes;
  return r > 0 ? Math.round((e.wins / r) * 100) : 0;
}

const SPORT_CONFIG: Record<SportTab, { color: string; glow: string; border: string; activeBg: string; label: string; accent: string }> = {
  NBA:   { label: "NBA",   color: "text-blue-300",   glow: "rgba(59,130,246,0.12)",  border: "border-blue-400/30",  activeBg: "bg-blue-500/15",   accent: "#3B82F6" },
  MLB:   { label: "MLB",   color: "text-sky-300",    glow: "rgba(56,189,248,0.12)",  border: "border-sky-400/30",   activeBg: "bg-sky-500/15",    accent: "#38BDF8" },
  MIXED: { label: "Mixed", color: "text-violet-300", glow: "rgba(139,92,246,0.12)",  border: "border-violet-400/30",activeBg: "bg-violet-500/15", accent: "#8B5CF6" },
};

function offsetDayId(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export default function DailyLeaderboardPage() {
  const { user } = useAuth();

  const [dayOffset, setDayOffset]   = useState(0);
  const activeDayId    = useMemo(() => offsetDayId(dayOffset), [dayOffset]);
  const activeDayLabel = useMemo(() => getDayLabel(activeDayId, "es-PR"), [activeDayId]);
  const isToday        = dayOffset === 0;

  const [sport, setSport]       = useState<SportTab>("NBA");
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [err,   setErr]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [qText, setQText]       = useState("");
  const unsubRef = useRef<(() => void) | null>(null);

  // Load user plan
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setUserPlan((snap.data() as any)?.plan ?? "free");
    });
  }, [user?.uid]);

  const isPremium = userPlan === "premium";

  // ── Daily Leaderboard fetch ──
  // Source: picks_daily filtered by dayId + sport (completely separate from weekly picks/leaderboard)
  // Aggregates results client-side. Requires Firestore rule: allow read: if signedIn() on picks_daily
  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    setLoading(true);
    setErr(null);
    setEntries([]);
    let cancelled = false;

    const sportsToQuery = sport === "MIXED" ? ["NBA", "MLB"] : [sport];
    const allPicks: any[][] = sportsToQuery.map(() => []);
    const unsubs: (() => void)[] = [];

    function aggregateFromPicks(picks: any[]): LeaderboardEntry[] {
      const map = new Map<string, LeaderboardEntry>();
      for (const p of picks) {
        const uid = p.uid ?? p.userId;
        if (!uid) continue;
        const e = map.get(uid) ?? {
          uid,
          displayName: p.displayName ?? p.username ?? null,
          username:    p.username ?? null,
          totalPoints: 0, wins: 0, losses: 0, pushes: 0, totalPicks: 0,
        };
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

    const merge = () => {
      if (cancelled) return;
      setEntries(aggregateFromPicks(allPicks.flat()));
      setLoading(false);
    };

    sportsToQuery.forEach((s, i) => {
      const q = query(
        collection(db, "picks_daily"),
        where("dayId", "==", activeDayId),
        where("sport", "==", s),
      );
      const unsub = onSnapshot(
        q,
        snap => {
          if (cancelled) return;
          allPicks[i] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          merge();
        },
        e => {
          if (cancelled) return;
          setErr(String((e as any)?.message ?? e));
          setLoading(false);
        }
      );
      unsubs.push(unsub);
    });

    unsubRef.current = () => { cancelled = true; unsubs.forEach(u => u()); };
    return () => { cancelled = true; unsubRef.current?.(); unsubRef.current = null; };
  }, [activeDayId, sport]);

  // Enrich entries that have no displayName/username by looking up from "usernames" collection
  const [enrichedEntries, setEnrichedEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    if (entries.length === 0) { setEnrichedEntries([]); return; }
    let alive = true;
    const needsLookup = entries.filter(e => !e.displayName && !e.username);
    if (needsLookup.length === 0) { setEnrichedEntries(entries); return; }

    (async () => {
      const { getDocs, query: fsQ, collection: fsCol, where: fsWhere } = await import("firebase/firestore");
      const uids = needsLookup.map(e => e.uid).filter(Boolean);
      const nameMap: Record<string, string> = {};
      // Firestore "in" supports up to 10 per query
      for (let i = 0; i < uids.length; i += 10) {
        try {
          const batch = uids.slice(i, i + 10);
          const snap = await getDocs(fsQ(fsCol(db, "usernames"), fsWhere("uid", "in", batch)));
          snap.forEach(d => {
            const data = d.data() as any;
            const uid = data.uid ?? d.id;
            nameMap[uid] = data.username ?? d.id;
          });
        } catch { /* ignore */ }
      }
      if (!alive) return;
      setEnrichedEntries(entries.map(e => ({
        ...e,
        username: e.username ?? nameMap[e.uid] ?? null,
        displayName: e.displayName ?? nameMap[e.uid] ?? null,
      })));
    })();
    return () => { alive = false; };
  }, [entries]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    const base = enrichedEntries.length > 0 ? enrichedEntries : entries;
    if (!t) return base;
    return base.filter(e => (e.displayName??e.username??"").toLowerCase().includes(t));
  }, [enrichedEntries, entries, qText]);

  const displayEntries = useMemo(() => enrichedEntries.length > 0 ? enrichedEntries : entries, [enrichedEntries, entries]);
  const myEntry = useMemo(() => displayEntries.find(e => e.uid === user?.uid), [displayEntries, user?.uid]);
  const myRank  = useMemo(() => { const i = displayEntries.findIndex(e=>e.uid===user?.uid); return i>=0?i+1:null; }, [displayEntries, user?.uid]);
  const cfg = SPORT_CONFIG[sport];
  const MEDALS = ["🥇","🥈","🥉"];

  const TABS: SportTab[] = isPremium ? ["NBA","MLB","MIXED"] : ["NBA","MLB"];

  return (
    <Protected>
      <div className="px-4 md:px-8 py-6">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-1">
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

            <div className="flex flex-wrap items-center gap-2">
              {/* Day navigation */}
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-0.5">
                <button
                  onClick={() => setDayOffset(v => v - 1)}
                  className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:bg-white/8 hover:text-white transition"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setDayOffset(0)}
                  disabled={isToday}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    isToday
                      ? "text-white/20 cursor-default"
                      : "text-white/60 hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                >
                  Hoy
                </button>
                <button
                  onClick={() => setDayOffset(v => Math.min(v + 1, 0))}
                  disabled={isToday}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    isToday
                      ? "text-white/20 cursor-default"
                      : "text-white/60 hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                >
                  Next →
                </button>
              </div>
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

          {/* Sport tabs */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {TABS.map(s => {
              const c = SPORT_CONFIG[s];
              const active = sport === s;
              return (
                <button key={s} onClick={() => setSport(s)}
                  className={[
                    "rounded-xl border px-5 py-2 text-sm font-semibold transition-all",
                    active
                      ? `${c.activeBg} ${c.border} ${c.color}`
                      : "border-white/10 bg-black/20 text-white/50 hover:text-white/80 hover:bg-white/5",
                  ].join(" ")}
                >
                  {s === "MIXED" ? "🏆 Mixed" : s}
                </button>
              );
            })}
            {!isPremium && (
              <div className="flex items-center gap-2 rounded-xl border border-violet-400/15 bg-violet-500/5 px-4 py-2">
                <span className="text-xs text-violet-400/60">🏆 Mixed</span>
                <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300/70 uppercase tracking-wider">Premium</span>
                <Link href="/store" className="text-[10px] text-violet-400/50 hover:text-violet-300 transition">Upgrade →</Link>
              </div>
            )}
            <input
              value={qText}
              onChange={e => setQText(e.target.value)}
              placeholder="Buscar jugador..."
              className="ml-auto rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 w-48"
            />
          </div>

          {/* My stats */}
          {myEntry && (
            <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Tu Rank",   val: `#${myRank}`,                       sub: `de ${displayEntries.length}` },
                { label: "Puntos",    val: myEntry.totalPoints.toLocaleString(), sub: isToday ? "hoy" : activeDayLabel },
                { label: "Record",    val: `${myEntry.wins}W-${myEntry.losses}L-${myEntry.pushes}P`, sub: `${myEntry.totalPicks} picks`},
                { label: "Win Rate",  val: `${winRate(myEntry)}%`,               sub: "efectividad" },
              ].map(({ label, val, sub }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="text-xs text-white/50 mb-1">{label}</div>
                  <div className="text-xl font-bold text-white tabular-nums">{val}</div>
                  <div className="text-xs text-white/35 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
          )}

          {err && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">{err}</div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[56px_1fr_80px_120px_100px] gap-3 border-b border-white/10 bg-black/30 px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">
              <div>Rank</div>
              <div>Player</div>
              <div className="text-center">Win%</div>
              <div className="text-right">Record</div>
              <div className="text-right">Points</div>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 m-4">
                <div className="text-lg font-semibold">No rankings yet</div>
                <div className="mt-1 text-white/60 text-sm">
                  Los rankings aparecen cuando los picks del día se resuelven (status <span className="text-white/80 font-medium">FINAL</span>).
                  Si los picks están en <span className="text-amber-300/80 font-medium">Pending</span>, los puntos aún no han sido calculados.
                </div>
                <div className="mt-4 flex gap-2">
                  <Link href="/tournaments/daily" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 transition">
                    Hacer picks →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {filtered.map((entry, idx) => {
                  const rank  = idx + 1;
                  const isMe  = entry.uid === user?.uid;
                  const top3  = rank <= 3;
                  const wr    = winRate(entry);
                  const name  = entry.displayName ?? entry.username ?? "User";

                  return (
                    <div key={entry.uid}
                      className={[
                        "grid grid-cols-[56px_1fr_80px_120px_100px] gap-3 px-4 py-3.5 text-sm transition-colors",
                        isMe ? "bg-emerald-500/8" : "bg-black/20 hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      {/* Rank */}
                      <div className="flex items-center text-white/70 font-semibold">
                        {top3 ? MEDALS[rank-1] : `#${rank}`}
                      </div>

                      {/* Player */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={[
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                          isMe ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                               : top3 ? "border-white/15 bg-white/8 text-white/70"
                               : "border-white/8 bg-white/5 text-white/40",
                        ].join(" ")}>
                          {initials(name)}
                        </div>
                        <div className="min-w-0">
                          <div className={["truncate font-medium", isMe ? "text-emerald-300" : "text-white/80"].join(" ")}>
                            {name}
                          </div>
                          <div className="truncate text-xs text-white/35">
                            @{(entry.username ?? name).toLowerCase().replace(/\s+/g, "")}
                          </div>
                        </div>
                      </div>

                      {/* Win rate */}
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-xs font-semibold text-white/60 tabular-nums">{wr}%</span>
                        <div className="h-1 w-12 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/50 transition-all" style={{ width: `${wr}%` }} />
                        </div>
                      </div>

                      {/* Record */}
                      <div className="flex items-center justify-end gap-1 text-xs tabular-nums">
                        <span className="font-semibold text-green-400/80">{entry.wins}W</span>
                        <span className="text-white/20">·</span>
                        <span className="font-semibold text-red-400/70">{entry.losses}L</span>
                        <span className="text-white/20">·</span>
                        <span className="font-semibold text-yellow-400/60">{entry.pushes}P</span>
                      </div>

                      {/* Points */}
                      <div className={[
                        "flex items-center justify-end text-sm font-bold tabular-nums",
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
            <span>{displayEntries.length} jugador{displayEntries.length !== 1 ? "es" : ""}</span>
          </div>

        </div>
      </div>
    </Protected>
  );
}
