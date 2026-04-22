"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getDayId } from "@/lib/day";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import Protected from "@/components/protected";
import FreePicksWidget from "@/components/free-picks-widget";

// ─── WelcomeBonusBanner (inline) ──────────────────────────────────────────────
function WelcomeBonusBanner({ rp, onDismiss }: { rp: number; onDismiss: () => void }) {
  return (
    <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="text-3xl">🎉</div>
        <div>
          <div className="text-sm font-semibold text-white">¡Bienvenido a Stat2Win!</div>
          <div className="text-xs text-white/60 mt-0.5">
            Completaste los primeros pasos y ganaste{" "}
            <span className="text-emerald-300 font-semibold">+{rp} RP</span> de bienvenida.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link href="/store" className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition">Ver tienda →</Link>
        <button onClick={onDismiss} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/8 transition">✕</button>
      </div>
    </div>
  );
}

// ─── OnboardingChecklist (inline) ─────────────────────────────────────────────
function OnboardingChecklist({ hasFirstPick, hasDailyLogin, hasTop10, welcomeBonusClaimed }: {
  hasFirstPick: boolean; hasDailyLogin: boolean; hasTop10: boolean; welcomeBonusClaimed: boolean;
}) {
  const steps = [
    { label: "Crea tu cuenta", done: true },
    { label: "Daily login", done: hasDailyLogin },
    { label: "Primer pick", done: hasFirstPick },
    { label: "Top 10", done: hasTop10 },
  ];
  const completed = steps.filter(s => s.done).length;
  if (welcomeBonusClaimed || completed === steps.length) return null;
  return (
    <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Primeros pasos</div>
          <div className="text-xs text-white/45 mt-0.5">
            {completed} de {steps.length} completados
            {!welcomeBonusClaimed && <span className="ml-2 text-amber-300/80">· Completa el paso 3 y gana 25 RP 🎁</span>}
          </div>
        </div>
        <div className="text-xs text-blue-300 font-semibold">{Math.round((completed / steps.length) * 100)}%</div>
      </div>
      <div className="mb-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${(completed / steps.length) * 100}%` }} />
      </div>
      <div className="flex gap-2 flex-wrap">
        {steps.map((step, i) => (
          <div key={i} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs ${step.done ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-300" : "border-white/8 bg-white/[0.02] text-white/35"}`}>
            <span>{step.done ? "✓" : `${i + 1}`}</span>
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}const functions = getFunctions(getApp(), "us-central1");

// ─── Types ────────────────────────────────────────────────────────────────────

type PickDoc = {
  id: string;
  uid?: string;
  sport?: string;
  market?: string;
  weekId?: string;
  result?: string;
  pointsAwarded?: number;
  createdAt?: any;
  updatedAt?: any;
};

type DailyPickDoc = PickDoc & { dayId?: string };

function getMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

// ─── Mini Leaderboard ─────────────────────────────────────────────────────────

function MiniLeaderboard({ weekId, currentUid }: { weekId: string; currentUid: string | null }) {
  const [activeSport, setActiveSport] = useState<"NBA" | "MLB" |"Soccer">("NBA");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fn = httpsCallable(getFunctions(getApp(), "us-central1"), "getLeaderboardWeek");
    fn({ weekId, sport: activeSport, market: "ALL" })
      .then((res: any) => setRows(Array.isArray(res?.data?.rows) ? res.data.rows.slice(0, 5) : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [weekId, activeSport]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121418] p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-white">Leaderboard</div>
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {(["NBA", "MLB"] as const).map((s) => (
            <button key={s} onClick={() => setActiveSport(s)}
              className={`px-3 py-1 text-xs font-semibold transition ${activeSport === s ? "bg-blue-500/20 text-blue-300" : "text-white/40 hover:text-white/70"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-9 animate-pulse rounded-xl bg-white/5" />)}</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-white/30">Sin datos esta semana</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r: any, idx) => {
            const rank = idx + 1;
            const isMe = currentUid && r.uid === currentUid;
            const name = (r.displayName || r.username || "User").trim();
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
            const pts = Number(r.points ?? 0);
            const maxPts = Number(rows[0]?.points ?? 1);
            const barWidth = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;
            return (
              <div key={r.id || r.uid}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${isMe ? "border border-emerald-500/20 bg-emerald-500/8" : "border border-white/5 bg-white/[0.02]"}`}>
                <div className="w-5 text-xs text-white/40 flex-shrink-0 text-center">
                  {medal ?? <span className="text-white/25">#{rank}</span>}
                </div>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-black ${isMe ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/50"}`}>
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-xs font-medium ${isMe ? "text-emerald-300" : "text-white/75"}`}>{name}</div>
                  <div className="mt-0.5 h-1 w-full rounded-full bg-white/8 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${rank === 1 ? "bg-amber-400" : rank === 2 ? "bg-slate-400" : rank === 3 ? "bg-orange-400" : "bg-blue-500/60"}`}
                      style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
                <div className={`text-xs font-bold flex-shrink-0 ${rank === 1 ? "text-amber-300" : "text-white/65"}`}>{pts}</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Link href={`/leaderboard/${activeSport.toLowerCase()}`}
          className="block w-full rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs text-white/55 transition hover:bg-white/8 hover:text-white/80">
          Ver ranking completo →
        </Link>
      </div>
    </div>
  );
}

// ─── Picks Bar Chart ──────────────────────────────────────────────────────────

function PicksChart({ weeklyPicks, dailyPicks }: { weeklyPicks: PickDoc[]; dailyPicks: DailyPickDoc[] }) {
  const allPicks = useMemo(() => [...weeklyPicks, ...dailyPicks], [weeklyPicks, dailyPicks]);

  const totals = useMemo(() => {
    const resolved = allPicks.filter(p => p.result && p.result !== "pending");
    return {
      wins:   resolved.filter(p => p.result === "win").length,
      losses: resolved.filter(p => p.result === "loss").length,
      pushes: resolved.filter(p => p.result === "push").length,
      total:  resolved.length,
    };
  }, [allPicks]);

  const byMarket = useMemo(() => {
    const resolved = allPicks.filter(p => p.result && p.result !== "pending");
    return ["moneyline", "spread", "ou"].map(m => {
      const picks = resolved.filter(p => {
        const mkt = String(p.market ?? "").toLowerCase();
        return mkt === m || (m === "ou" && mkt === "total");
      });
      const wins = picks.filter(p => p.result === "win").length;
      return {
        label: m === "moneyline" ? "ML" : m === "spread" ? "SP" : "O/U",
        wins,
        losses: picks.filter(p => p.result === "loss").length,
        pushes: picks.filter(p => p.result === "push").length,
        total: picks.length,
        winRate: picks.length > 0 ? Math.round((wins / picks.length) * 100) : null,
      };
    });
  }, [allPicks]);

  const bySport = useMemo(() => {
    const resolved = allPicks.filter(p => p.result && p.result !== "pending");
    return ["NBA", "MLB", "SOCCER"].map(s => {
      const picks = resolved.filter(p => String(p.sport ?? "").toUpperCase() === s);
      const wins = picks.filter(p => p.result === "win").length;
      return {
        sport: s,
        wins,
        losses: picks.filter(p => p.result === "loss").length,
        pushes: picks.filter(p => p.result === "push").length,
        total: picks.length,
        winRate: picks.length > 0 ? Math.round((wins / picks.length) * 100) : null,
      };
    }).filter(s => s.total > 0);
  }, [allPicks]);

  const maxBar = Math.max(totals.wins, totals.losses, totals.pushes, 1);

  if (totals.total === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
        <div className="text-sm font-semibold text-white mb-1">Rendimiento de Picks</div>
        <div className="text-xs text-white/40 mb-4">Esta semana · daily + weekly</div>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <span className="text-3xl">🎯</span>
          <span className="text-xs text-white/35">Sin picks resueltos aún esta semana</span>
          <Link href="/tournaments" className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-xs text-blue-300 hover:bg-blue-500/15 transition">
            Hacer picks →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
      <div className="text-sm font-semibold text-white mb-0.5">Rendimiento de Picks</div>
      <div className="text-xs text-white/40 mb-5">Esta semana · {totals.total} resueltos</div>

      {/* Main W/L/P bars */}
      <div className="space-y-3 mb-5">
        {[
          { label: "Wins",   val: totals.wins,   color: "bg-emerald-400",  text: "text-emerald-300" },
          { label: "Losses", val: totals.losses, color: "bg-red-400",      text: "text-red-300" },
          { label: "Push",   val: totals.pushes, color: "bg-yellow-400",   text: "text-yellow-300" },
        ].map(({ label, val, color, text }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-12 text-[11px] text-white/50 font-medium">{label}</div>
            <div className="flex-1 h-2.5 rounded-full bg-white/8 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.round((val / maxBar) * 100)}%` }} />
            </div>
            <div className={`w-6 text-right text-xs font-bold ${text}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/8 pt-4">
        {/* By market */}
        <div className="text-[10px] uppercase tracking-widest text-white/30 mb-2.5">Por mercado</div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {byMarket.map(m => (
            <div key={m.label} className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-center">
              <div className="text-[10px] text-white/40 mb-0.5">{m.label}</div>
              <div className="text-sm font-bold text-white">{m.winRate !== null ? `${m.winRate}%` : "—"}</div>
              <div className="text-[9px] text-white/25 mt-0.5">{m.total > 0 ? `${m.wins}W ${m.losses}L` : "sin datos"}</div>
            </div>
          ))}
        </div>

        {/* By sport */}
        {bySport.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-widest text-white/30 mb-2.5">Por deporte</div>
            <div className="space-y-2">
              {bySport.map(s => {
                const EMOJI: Record<string, string> = { NBA: "🏀", MLB: "⚾", SOCCER: "⚽" };
                const barW = s.total > 0 ? Math.round(((s.winRate ?? 0) / 100) * 100) : 0;
                return (
                  <div key={s.sport} className="flex items-center gap-2.5">
                    <span className="text-sm w-5">{EMOJI[s.sport] ?? "🎯"}</span>
                    <div className="w-12 text-[10px] text-white/50">{s.sport}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400/70 transition-all duration-500"
                        style={{ width: `${barW}%` }} />
                    </div>
                    <div className="text-xs font-semibold text-white/60 w-8 text-right">
                      {s.winRate !== null ? `${s.winRate}%` : "—"}
                    </div>
                    <div className="text-[10px] text-white/30 w-14 text-right">
                      {s.wins}W·{s.losses}L{s.pushes > 0 ? `·${s.pushes}P` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Streak Card ──────────────────────────────────────────────────────────────

function StreakCard({ uid }: { uid: string | null }) {
  const [current, setCurrent]  = useState<number | null>(null);
  const [longest, setLongest]  = useState<number | null>(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const ref = doc(db, "users", uid, "streaks", "picks");
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const d = snap.data() as any;
        setCurrent(Number(d.currentStreak ?? 0));
        setLongest(Number(d.longestStreak ?? 0));
      } else {
        setCurrent(0);
        setLongest(0);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  const nextMilestone = current !== null
    ? current < 5 ? 5 : current < 10 ? 10 : Math.ceil((current + 1) / 10) * 10
    : 5;
  const progress = current !== null
    ? current < 5
      ? Math.round((current / 5) * 100)
      : current < 10
        ? Math.round(((current - 5) / 5) * 100)
        : Math.round(((current % 10) / 10) * 100)
    : 0;
  const nextBonus = nextMilestone <= 5 ? 300 : 1000;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
      <div className="text-sm font-semibold text-white mb-4">Racha de Picks 🔥</div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 rounded-xl bg-white/5" />
          <div className="h-6 rounded-xl bg-white/5" />
        </div>
      ) : (
        <>
          {/* Current streak big display */}
          <div className="flex items-end gap-3 mb-4">
            <div>
              <div className={`text-5xl font-black tabular-nums ${(current ?? 0) >= 5 ? "text-amber-300" : "text-white"}`}>
                {current ?? 0}
              </div>
              <div className="text-xs text-white/40 mt-1">wins consecutivos</div>
            </div>
            {(current ?? 0) > 0 && (
              <div className="mb-2 text-3xl">
                {(current ?? 0) >= 10 ? "🔥🔥" : (current ?? 0) >= 5 ? "🔥" : "✨"}
              </div>
            )}
          </div>

          {/* Progress to next milestone */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-white/40">Próximo bonus: {nextMilestone} wins</span>
              <span className="text-[10px] font-semibold text-amber-300">+{nextBonus} RP</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400/70 transition-all duration-500"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-white/30">
              {current ?? 0} / {nextMilestone} picks
            </div>
          </div>

          {/* Record */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
              <div className="text-[10px] text-white/35 mb-0.5">Racha actual</div>
              <div className="text-lg font-bold text-white">{current ?? 0}</div>
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2.5">
              <div className="text-[10px] text-amber-400/60 mb-0.5">Récord personal</div>
              <div className="text-lg font-bold text-amber-300">{longest ?? 0}</div>
            </div>
          </div>

          {/* Milestone badges */}
          <div className="mt-3 flex gap-2">
            <div className={`flex-1 rounded-xl border px-2 py-1.5 text-center text-[10px] font-semibold transition ${(longest ?? 0) >= 5 ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-white/8 bg-white/[0.02] text-white/20"}`}>
              🔥 5 picks · 300 RP
            </div>
            <div className={`flex-1 rounded-xl border px-2 py-1.5 text-center text-[10px] font-semibold transition ${(longest ?? 0) >= 10 ? "border-orange-400/30 bg-orange-400/10 text-orange-300" : "border-white/8 bg-white/[0.02] text-white/20"}`}>
              🔥🔥 10 picks · 1000 RP
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards({
  rewardPoints, loadingRewards, winRate, loadingPicks, currentWeekPicks,
}: {
  rewardPoints: number; loadingRewards: boolean; winRate: number | null;
  loadingPicks: boolean; currentWeekPicks: PickDoc[];
}) {
  const marketStats = useMemo(() => {
    const resolved = currentWeekPicks.filter(p => p.result && p.result !== "pending");
    return ["moneyline", "spread", "ou"].map(m => {
      const picks = resolved.filter(p => {
        const mkt = String(p.market ?? "").toLowerCase();
        return mkt === m || (m === "ou" && mkt === "total");
      });
      const wins = picks.filter(p => p.result === "win").length;
      const rate = picks.length > 0 ? Math.round((wins / picks.length) * 100) : null;
      return { label: m === "moneyline" ? "ML" : m === "spread" ? "SP" : "O/U", rate, count: picks.length };
    });
  }, [currentWeekPicks]);

  const bestMarket = useMemo(() => {
    return marketStats.filter(m => m.rate !== null && m.count >= 1)
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0] ?? null;
  }, [marketStats]);

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <div className="rounded-2xl border border-amber-300/20 bg-[#161A22] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-amber-200/60 mb-2">Reward Points</div>
        <div className="text-3xl font-bold text-white">{loadingRewards ? "…" : rewardPoints.toLocaleString()}</div>
        <div className="mt-2 text-xs text-white/35">Total acumulado</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Win Rate</div>
        <div className="text-3xl font-bold text-white">{loadingPicks ? "…" : winRate === null ? "—" : `${winRate}%`}</div>
        {!loadingPicks && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {marketStats.map(m => (
              <span key={m.label} className="text-[10px] text-white/30">
                <span className="text-white/50">{m.label}</span> {m.rate !== null ? `${m.rate}%` : "—"}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Picks Semana</div>
        <div className="text-3xl font-bold text-white">
          {loadingPicks ? "…" : currentWeekPicks.length}
        </div>
        {!loadingPicks && (
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="text-[10px] text-emerald-400/80">
              {currentWeekPicks.filter(p => p.result === "win").length}W
            </span>
            <span className="text-[10px] text-red-400/70">
              {currentWeekPicks.filter(p => p.result === "loss").length}L
            </span>
            <span className="text-[10px] text-white/30">
              {currentWeekPicks.filter(p => (p.result ?? "pending") === "pending").length} pendientes
            </span>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Mejor mercado</div>
        <div className="text-2xl font-bold text-white mt-1">{loadingPicks ? "…" : bestMarket ? bestMarket.label : "—"}</div>
        <div className="mt-2 text-xs text-white/35">{bestMarket?.rate != null ? `${bestMarket.rate}% win rate` : "Sin datos aún"}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { plan, loading: entLoading } = useUserEntitlements();
  const currentWeekId    = useMemo(() => getWeekId(new Date()), []);
  const currentWeekLabel = useMemo(() => getWeekRangeLabel(new Date(), "es-PR"), []);
  const todayDayId       = useMemo(() => getDayId(), []);

  const [uid, setUid]           = useState<string | null>(auth.currentUser?.uid ?? null);
  const [allPicks, setAllPicks] = useState<PickDoc[]>([]);
  const [dailyPicks, setDailyPicks] = useState<DailyPickDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);

  const [rewardPoints, setRewardPoints] = useState(0);
  const [loadingRewards, setLoadingRewards]   = useState(true);
  const [dailyNotice, setDailyNotice]         = useState<string | null>(null);
  const [hasDailyLogin, setHasDailyLogin]     = useState(false);
  const [welcomeBonusClaimed, setWelcomeBonusClaimed] = useState(false);
  const [welcomeBonusLoading, setWelcomeBonusLoading] = useState(true);
  const [welcomeBannerRP, setWelcomeBannerRP] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  // Load weekly picks
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setAllPicks([]); setLoadingPicks(false); return; }
    setLoadingPicks(true);
    getDocs(query(collection(db, "picks"), where("uid", "==", uid)))
      .then(snap => {
        if (cancelled) return;
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as PickDoc[];
        rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setAllPicks(rows);
      })
      .catch(() => { if (!cancelled) setAllPicks([]); })
      .finally(() => { if (!cancelled) setLoadingPicks(false); });
    return () => { cancelled = true; };
  }, [uid]);

  // Load daily picks (today)
  useEffect(() => {
    if (!uid) { setDailyPicks([]); return; }
    const q = query(
      collection(db, "picks_daily"),
      where("uid", "==", uid),
      where("dayId", "==", todayDayId),
    );
    const unsub = onSnapshot(q,
      snap => setDailyPicks(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => setDailyPicks([]),
    );
    return () => unsub();
  }, [uid, todayDayId]);

  // Load reward points
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setRewardPoints(0); setLoadingRewards(false); setWelcomeBonusLoading(false); return; }
    setLoadingRewards(true);
    getDoc(doc(db, "users", uid)).then(snap => {
      if (cancelled) return;
      const data = snap.exists() ? (snap.data() as any) : {};
      setRewardPoints(Number(data?.rewardPoints ?? 0));
      setWelcomeBonusClaimed(data?.welcomeBonusClaimed === true);
      setWelcomeBonusLoading(false);
    }).catch(() => { if (!cancelled) { setRewardPoints(0); setWelcomeBonusLoading(false); } })
      .finally(() => { if (!cancelled) setLoadingRewards(false); });
    return () => { cancelled = true; };
  }, [uid]);

  // Claim daily reward
  useEffect(() => {
    let cancelled = false;
    if (!uid) return;
    (async () => {
      try {
        const fn = httpsCallable(functions, "claimDailyLoginReward");
        const res: any = await fn();
        const data = res?.data ?? {};
        if (cancelled) return;
        if (data?.claimed === true) {
          setDailyNotice(`Daily reward claimed: +${data?.awardedRP ?? 5} RP`);
          setRewardPoints(prev => prev + Number(data?.awardedRP ?? 5));
          setHasDailyLogin(true);
        } else if (data?.alreadyClaimed) {
          setHasDailyLogin(true);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  // Welcome bonus
  useEffect(() => {
    let cancelled = false;
    if (!uid || welcomeBonusLoading || welcomeBonusClaimed) return;
    (async () => {
      try {
        const fn = httpsCallable(functions, "claimWelcomeBonus");
        const res: any = await fn();
        const data = res?.data ?? {};
        if (cancelled) return;
        if (data?.claimed === true) {
          setWelcomeBannerRP(Number(data?.awardedRP ?? 25));
          setWelcomeBonusClaimed(true);
          setRewardPoints(prev => prev + Number(data?.awardedRP ?? 25));
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [uid, welcomeBonusLoading, welcomeBonusClaimed]);

  const currentWeekPicks = useMemo(
    () => allPicks.filter(p => p.weekId === currentWeekId),
    [allPicks, currentWeekId],
  );

  const winRate = useMemo(() => {
    const resolved = currentWeekPicks.filter(p => p.result && p.result !== "pending");
    if (resolved.length === 0) return null;
    const wins = resolved.filter(p => p.result === "win").length;
    return Math.round((wins / resolved.length) * 100);
  }, [currentWeekPicks]);

  const activePicks  = useMemo(() => currentWeekPicks.filter(p => (p.result ?? "pending") === "pending").length, [currentWeekPicks]);
  const resolvedCount = useMemo(() => currentWeekPicks.filter(p => (p.result ?? "pending") !== "pending").length, [currentWeekPicks]);

  // Combine weekly + daily for the chart (this week only)
  const weeklyResolved = useMemo(
    () => allPicks.filter(p => p.weekId === currentWeekId),
    [allPicks, currentWeekId],
  );

  return (
    <Protected>
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="text-sm text-white/50 mt-0.5">Tu progreso y recompensas de la semana actual.</p>
            <div className="mt-1.5 text-xs text-white/30">{currentWeekId} • {currentWeekLabel}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              Plan: {plan.toUpperCase()}
            </span>
            <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200 font-medium">
              {loadingRewards ? "…" : `${rewardPoints.toLocaleString()} RP`}
            </span>
          </div>
        </div>

        {/* Notices */}
        {dailyNotice && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {dailyNotice}
          </div>
        )}
        {welcomeBannerRP !== null && (
          <WelcomeBonusBanner rp={welcomeBannerRP} onDismiss={() => setWelcomeBannerRP(null)} />
        )}

        <OnboardingChecklist
          hasFirstPick={allPicks.length > 0}
          hasDailyLogin={hasDailyLogin}
          hasTop10={false}
          welcomeBonusClaimed={welcomeBonusClaimed}
        />

        {/* Stats cards */}
        <StatsCards
          rewardPoints={rewardPoints}
          loadingRewards={loadingRewards}
          winRate={winRate}
          loadingPicks={loadingPicks}
          currentWeekPicks={currentWeekPicks}
        />

        {/* Free Picks Widget */}
        <div className="mt-5">
          <FreePicksWidget />
        </div>

        {/* Main grid: Chart + Streak + Actions + Leaderboard */}
        <div className="mt-5 grid gap-4 lg:grid-cols-3">

          {/* Col 1: Picks Chart */}
          <div className="lg:col-span-1">
            <PicksChart weeklyPicks={weeklyResolved} dailyPicks={dailyPicks} />
          </div>

          {/* Col 2: Streak card + Quick actions */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <StreakCard uid={uid} />

            {/* Quick actions compact */}
            <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
              <div className="text-sm font-semibold text-white mb-3">Acciones rápidas</div>
              <div className="flex flex-col gap-2">
                <Link href="/tournaments"
                  className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-200 flex items-center justify-between hover:bg-blue-500/15 transition">
                  <span>Ir a Tournaments</span><span className="text-blue-400/50">→</span>
                </Link>
                <Link href="/store"
                  className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200 flex items-center justify-between hover:bg-amber-400/15 transition">
                  <span>Canjear Rewards</span><span className="text-amber-400/50">→</span>
                </Link>
                <Link href="/picks"
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/65 flex items-center justify-between hover:bg-white/6 transition">
                  <span>Ver mis Picks</span><span className="text-white/25">→</span>
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Picks activos</div>
                  <div className="text-xl font-bold text-white">{loadingPicks ? "…" : activePicks}</div>
                  <div className="text-[10px] text-white/25 mt-0.5">{currentWeekId}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Resueltos</div>
                  <div className="text-xl font-bold text-white">{loadingPicks ? "…" : resolvedCount}</div>
                  <div className="text-[10px] text-white/25 mt-0.5">{currentWeekId}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Col 3: Leaderboard */}
          <div className="lg:col-span-1">
            <MiniLeaderboard weekId={currentWeekId} currentUid={uid} />
          </div>
        </div>

      </div>
    </Protected>
  );
}
