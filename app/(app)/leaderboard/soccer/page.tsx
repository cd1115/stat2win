"use client";

import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId } from "@/lib/week";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

type Market = "ALL" | "ML" | "SPREAD" | "OU";
type Sport = "NBA" | "MLB";

type LeaderRow = {
  id: string; uid: string; username?: string; displayName?: string;
  points: number; wins?: number; losses?: number; pushes?: number; picks?: number;
  pointsML?: number; winsML?: number; lossesML?: number; pushesML?: number; picksML?: number;
  pointsSpread?: number; winsSpread?: number; lossesSpread?: number; pushesSpread?: number; picksSpread?: number;
  pointsOU?: number; winsOU?: number; lossesOU?: number; pushesOU?: number; picksOU?: number;
};

const SPORT: Sport = "MLB";

function initials(name?: string) {
  const s = (name ?? "?").trim();
  return s.split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()??"").join("") || "?";
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function recordOf(row: LeaderRow | null, market: Market) {
  if (!row) return { w: undefined, l: undefined, p: undefined, picks: undefined };
  if (market === "ML")     return { w: row.winsML,     l: row.lossesML,     p: row.pushesML,     picks: row.picksML };
  if (market === "SPREAD") return { w: row.winsSpread, l: row.lossesSpread, p: row.pushesSpread, picks: row.picksSpread };
  if (market === "OU")     return { w: row.winsOU,     l: row.lossesOU,     p: row.pushesOU,     picks: row.picksOU };
  return { w: row.wins, l: row.losses, p: row.pushes, picks: row.picks };
}

function pointsOf(row: LeaderRow, market: Market) {
  if (market === "ML")     return row.pointsML ?? 0;
  if (market === "SPREAD") return row.pointsSpread ?? 0;
  if (market === "OU")     return row.pointsOU ?? 0;
  return row.points ?? 0;
}

function winRate(w=0, l=0, p=0) {
  const total = w + l + p;
  return total > 0 ? Math.round((w / total) * 100) : 0;
}

const MARKET_CONFIG: Record<Market, { label: string; short: string; color: string; activeBg: string; border: string }> = {
  ALL:    { label: "All markets", short: "ALL", color: "text-white",        activeBg: "bg-white/10",        border: "border-white/20" },
  ML:     { label: "Moneyline",   short: "ML",  color: "text-blue-300",     activeBg: "bg-blue-500/15",     border: "border-blue-400/30" },
  SPREAD: { label: "Spread",      short: "SP",  color: "text-violet-300",   activeBg: "bg-violet-500/15",   border: "border-violet-400/30" },
  OU:     { label: "O/U",         short: "O/U", color: "text-amber-300",    activeBg: "bg-amber-500/15",    border: "border-amber-400/30" },
};

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [market, setMarket] = useState<Market>("ALL");
  const [qText, setQText] = useState("");
  const [rowsRaw, setRowsRaw] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const weekDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + weekOffset * 7); return d;
  }, [weekOffset]);

  const weekId = useMemo(() => getWeekId(weekDate), [weekDate]);

  useEffect(() => {
    if (!user?.uid) { setLoading(true); setErr(null); setRowsRaw([]); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      setLoading(true); setErr(null);
      try {
        const fn = httpsCallable(getFunctions(getApp(), "us-central1"), "getLeaderboardWeek");
        const res: any = await fn({ weekId, sport: SPORT, market });
        if (!cancelled) setRowsRaw(Array.isArray(res?.data?.rows) ? res.data.rows : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Could not load leaderboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    timer = setInterval(load, 30000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user?.uid, weekId, market]);

  const rows = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return !t ? rowsRaw : rowsRaw.filter(r => (r.displayName||r.username||"").toLowerCase().includes(t));
  }, [rowsRaw, qText]);

  const myIndex = user?.uid ? rows.findIndex(r => r.uid === user.uid) : -1;
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const myRow   = myIndex >= 0 ? rows[myIndex] : null;
  const myRec   = recordOf(myRow, market);
  const myPts   = myRow ? pointsOf(myRow, market) : null;
  const myWR    = myRow ? winRate(myRec.w??0, myRec.l??0, myRec.p??0) : null;
  const mc      = MARKET_CONFIG[market];

  return (
    <Protected>
      <div className="px-4 md:px-8 py-6">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col gap-1 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
                  Week {weekId}
                </span>
                <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
                  {SPORT}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${mc.border} ${mc.activeBg} ${mc.color}`}>
                  {mc.label}
                </span>
              </div>
              <p className="text-white/50 text-sm">
                Rankings actualizan cuando los juegos van <span className="text-white/80">FINAL</span>.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                <button onClick={() => setWeekOffset(v => v-1)}
                  className="px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition border-r border-white/8">
                  ← Prev
                </button>
                <button onClick={() => setWeekOffset(0)}
                  className="px-4 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition border-r border-white/8">
                  Current
                </button>
                <button onClick={() => setWeekOffset(v => v+1)}
                  className="px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white/90 transition">
                  Next →
                </button>
              </div>
              <input value={qText} onChange={e => setQText(e.target.value)} placeholder="Buscar jugador..."
                className="w-full md:w-52 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20" />
            </div>
          </div>

          {/* Sport nav */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              <Link href="/leaderboard/nba"
                className="px-4 py-2 text-sm text-white/55 hover:bg-white/5 hover:text-white/90 transition border-r border-white/8">
                NBA
              </Link>
              <span className="px-4 py-2 text-sm font-semibold text-red-300 bg-red-500/10 cursor-default border-r border-white/8">
                MLB
              </span>
              <Link href="/leaderboard/soccer"
                className="px-4 py-2 text-sm text-white/55 hover:bg-white/5 hover:text-white/90 transition">
                ⚽ Soccer
              </Link>
            </div>
            <Link href="/leaderboard/daily"
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2 text-sm font-semibold text-amber-300/80 hover:bg-amber-400/12 transition">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Daily
            </Link>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {(["ALL","ML","SPREAD","OU"] as Market[]).map(m => {
              const c = MARKET_CONFIG[m];
              const active = m === market;
              return (
                <button key={m} onClick={() => setMarket(m)}
                  className={[
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition-all",
                    active ? `${c.activeBg} ${c.border} ${c.color}` : "border-white/10 bg-black/20 text-white/50 hover:text-white/80 hover:bg-white/5",
                  ].join(" ")}>
                  {c.short}
                </button>
              );
            })}
          </div>

          {/* My stats */}
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Players",    val: rows.length,                                  sub: "Active this week" },
              { label: "Your rank",  val: myRank ? `${medal(myRank)}` : "—",            sub: myRank ? `${myRank} of ${rows.length}` : "Not ranked yet" },
              { label: "Your points",val: myPts !== null ? `${myPts} pts` : "—",        sub: mc.label },
              { label: "Win rate",   val: myWR !== null ? `${myWR}%` : "—",             sub: myRec.picks ? `${myRec.picks} picks` : `Record: ${myRec.w??0}-${myRec.l??0}-${myRec.p??0}` },
            ].map(({ label, val, sub }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs text-white/50 mb-1">{label}</div>
                <div className="text-xl font-bold text-white tabular-nums">{val}</div>
                <div className="text-xs text-white/35 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {/* ── PODIUM TOP 3 ── */}
          {!loading && rows.length >= 1 && (
            <div className="mb-5 rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-white/30">Top 3 esta semana</div>
                <div className="text-xs text-white/20">{weekId}</div>
              </div>

              <div className="flex items-end justify-center gap-3 px-4 pb-0 pt-2">

                {/* #2 Silver */}
                {rows[1] && (() => {
                  const r2 = rows[1]; const rec2 = recordOf(r2, market);
                  const pts2 = pointsOf(r2, market); const wr2 = winRate(rec2.w??0, rec2.l??0, rec2.p??0);
                  const name2 = (r2.displayName || r2.username || "User").trim();
                  const isMe2 = user?.uid === r2.uid;
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 text-sm font-black ${isMe2 ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-slate-400/40 bg-slate-400/10 text-slate-300"}`}>{initials(name2)}</div>
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[72px] ${isMe2 ? "text-emerald-300" : "text-white/80"}`}>{name2.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{pts2.toLocaleString()} pts</div>
                        <div className="text-[11px] font-black text-slate-300 mt-0.5">{wr2}%</div>
                        <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-slate-400/60" style={{ width: `${wr2}%` }} />
                        </div>
                        <div className="text-[9px] text-white/30 mt-1">
                          <span className="text-emerald-400/70">{rec2.w??0}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{rec2.l??0}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/50">{rec2.p??0}P</span>
                        </div>
                      </div>
                      <div className="w-full h-16 rounded-t-xl bg-gradient-to-t from-slate-500/30 to-slate-400/10 border border-slate-400/20 border-b-0 flex items-center justify-center">
                        <span className="text-xl">🥈</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #1 Gold — tallest */}
                {rows[0] && (() => {
                  const r1 = rows[0]; const rec1 = recordOf(r1, market);
                  const pts1 = pointsOf(r1, market); const wr1 = winRate(rec1.w??0, rec1.l??0, rec1.p??0);
                  const name1 = (r1.displayName || r1.username || "User").trim();
                  const isMe1 = user?.uid === r1.uid;
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className="text-sm">👑</div>
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-base font-black ${isMe1 ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300" : "border-amber-400/60 bg-amber-400/15 text-amber-300"}`}>{initials(name1)}</div>
                      <div className="text-center">
                        <div className={`text-sm font-black truncate max-w-[80px] ${isMe1 ? "text-emerald-300" : "text-white"}`}>{name1.split(" ")[0]}</div>
                        <div className="text-[11px] font-bold text-amber-300">{pts1.toLocaleString()} pts</div>
                        <div className="text-[12px] font-black text-amber-300 mt-0.5">{wr1}%</div>
                        <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${wr1}%` }} />
                        </div>
                        <div className="text-[9px] text-white/40 mt-1">
                          <span className="text-emerald-400/80">{rec1.w??0}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{rec1.l??0}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/60">{rec1.p??0}P</span>
                        </div>
                      </div>
                      <div className="w-full h-24 rounded-t-xl bg-gradient-to-t from-amber-500/30 to-amber-400/10 border border-amber-400/25 border-b-0 flex items-center justify-center">
                        <span className="text-2xl">🥇</span>
                      </div>
                    </div>
                  );
                })()}

                {/* #3 Bronze */}
                {rows[2] && (() => {
                  const r3 = rows[2]; const rec3 = recordOf(r3, market);
                  const pts3 = pointsOf(r3, market); const wr3 = winRate(rec3.w??0, rec3.l??0, rec3.p??0);
                  const name3 = (r3.displayName || r3.username || "User").trim();
                  const isMe3 = user?.uid === r3.uid;
                  return (
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border-2 text-xs font-black ${isMe3 ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-orange-400/40 bg-orange-400/10 text-orange-300"}`}>{initials(name3)}</div>
                      <div className="text-center">
                        <div className={`text-xs font-bold truncate max-w-[64px] ${isMe3 ? "text-emerald-300" : "text-white/70"}`}>{name3.split(" ")[0]}</div>
                        <div className="text-[10px] text-white/40">{pts3.toLocaleString()} pts</div>
                        <div className="text-[10px] font-black text-orange-300 mt-0.5">{wr3}%</div>
                        <div className="w-10 h-1 rounded-full bg-white/10 overflow-hidden mx-auto mt-0.5">
                          <div className="h-full rounded-full bg-orange-400/60" style={{ width: `${wr3}%` }} />
                        </div>
                        <div className="text-[9px] text-white/30 mt-1">
                          <span className="text-emerald-400/70">{rec3.w??0}W</span><span className="text-white/20"> · </span>
                          <span className="text-red-400/60">{rec3.l??0}L</span><span className="text-white/20"> · </span>
                          <span className="text-yellow-400/50">{rec3.p??0}P</span>
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

          {/* Table */}
          <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_60px_90px_80px] gap-2 border-b border-white/10 bg-black/30 px-3 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">
              <div>Rank</div><div>Player</div>
              <div className="text-center">Win%</div>
              <div className="text-right">Record</div>
              <div className="text-right">Points</div>
            </div>

            {!user?.uid || loading ? (
              <div className="space-y-3 p-5">
                {[1,2,3].map(i=><div key={i} className="h-14 animate-pulse rounded-xl bg-white/5"/>)}
              </div>
            ) : err ? (
              <div className="m-4 rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-red-300 text-sm">Error: {err}</div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 m-4">
                <div className="text-lg font-semibold">No rankings yet</div>
                <div className="mt-1 text-white/60 text-sm">Points appear after resolved picks exist for this week.</div>
                <div className="mt-4">
                  <Link href="/tournaments/nba" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 transition">
                    Make picks
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {rows.map((r, idx) => {
                  const rank  = idx + 1;
                  const isMe  = !!(user?.uid && r.uid === user.uid);
                  const top3  = rank <= 3;
                  const rec   = recordOf(r, market);
                  const pts   = pointsOf(r, market);
                  const wr    = winRate(rec.w??0, rec.l??0, rec.p??0);
                  const name  = (r.displayName || r.username || "User").trim();

                  return (
                    <div key={r.id}
                      className={[
                        "grid grid-cols-[40px_1fr_60px_90px_80px] gap-2 px-3 py-3.5 text-sm transition-colors",
                        isMe ? "bg-emerald-500/8" : "bg-black/20 hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      <div className="flex items-center text-white/70 font-semibold text-xs">{medal(rank)}</div>

                      <div className="flex items-center gap-2 min-w-0">
                        <div className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                          isMe ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                               : top3 ? "border-white/15 bg-white/8 text-white/70"
                               : "border-white/8 bg-white/5 text-white/40",
                        ].join(" ")}>
                          {initials(name)}
                        </div>
                        <div className="min-w-0">
                          <div className={["truncate text-xs font-medium", isMe?"text-emerald-300":"text-white/80"].join(" ")}>{name}</div>
                          <div className="truncate text-[10px] text-white/35">@{(r.username||name).toLowerCase().replace(/\s+/g,"")}</div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-xs font-semibold text-white/60 tabular-nums">{wr}%</span>
                        <div className="h-1 w-8 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/50" style={{ width: `${wr}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 text-xs tabular-nums">
                        <span className="font-semibold text-green-400/80">{rec.w??0}W</span>
                        <span className="text-white/20">·</span>
                        <span className="font-semibold text-red-400/70">{rec.l??0}L</span>
                      </div>

                      <div className={[
                        "flex items-center justify-end text-xs font-bold tabular-nums",
                        isMe?"text-emerald-300":top3?"text-white":"text-white/60",
                      ].join(" ")}>
                        {pts.toLocaleString()}<span className="ml-0.5 text-[10px] font-normal text-white/30">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-white/25">
            <span>Win 100 · Push 50 · Loss 0</span>
            <span>{rows.length} jugador{rows.length !== 1 ? "es" : ""}</span>
          </div>

        </div>
      </div>
    </Protected>
  );
}
