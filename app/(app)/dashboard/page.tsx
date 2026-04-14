"use client";

import { useEffect, useMemo, useState } from "react";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { auth, db, functions } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import FreePicksWidget from "@/components/free-picks-widget";

type PickDoc = {
  id: string;
  sport?: string;
  weekId?: string;
  gameId?: string;
  market?: string;
  selection?: string;
  result?: "pending" | "win" | "loss" | "push";
  pointsAwarded?: number;
  createdAt?: any;
};

type RewardHistoryDoc = {
  id: string;
  userId?: string;
  type?: string;
  amount?: number;
  description?: string;
  createdAt?: any;
  weekId?: string;
  sport?: string;
  wins?: number;
  pushes?: number;
  plan?: string;
};

type LeaderboardEntry = {
  uid: string;
  points: number;
  wins: number;
  losses: number;
  pushes: number;
  picks: number;
};

function getMillis(value: any) {
  return typeof value?.toMillis === "function" ? value.toMillis() : 0;
}

function formatRewardAmount(amount?: number) {
  const n = Number(amount ?? 0);
  return n > 0 ? `+${n}` : `${n}`;
}

function formatRewardType(type?: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "daily_login") return "Daily Login";
  if (t === "leaderboard_reward") return "Leaderboard Reward";
  if (t === "welcome_bonus") return "Welcome Bonus";
  if (t === "redeem") return "Store Redemption";
  if (t === "pick_reward") return "Correct Pick";
  return type ?? "Reward";
}

function getRewardIcon(type?: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "daily_login") return "🎁";
  if (t === "leaderboard_reward") return "🏆";
  if (t === "welcome_bonus") return "🎉";
  if (t === "redeem") return "🛒";
  if (t === "pick_reward") return "✅";
  return "✨";
}

function formatRewardDate(createdAt: any) {
  const ms = getMillis(createdAt);
  if (!ms) return "Ahora";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function rankColors(rank: number) {
  if (rank === 1) return { bg: "bg-amber-400/15", text: "text-amber-300", border: "border-amber-400/25" };
  if (rank === 2) return { bg: "bg-slate-400/10", text: "text-slate-300", border: "border-slate-400/20" };
  if (rank === 3) return { bg: "bg-orange-400/10", text: "text-orange-300", border: "border-orange-400/20" };
  return { bg: "bg-white/5", text: "text-white/40", border: "border-white/10" };
}

function userInitials(name?: string) {
  if (!name) return "?";
  const parts = name.replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Welcome Banner (aparece solo cuando se acaba de ganar el bonus) ───────────
function WelcomeBonusBanner({ rp, onDismiss }: { rp: number; onDismiss: () => void }) {
  return (
    <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="text-3xl">🎉</div>
        <div>
          <div className="text-sm font-semibold text-white">
            ¡Bienvenido a Stat2Win!
          </div>
          <div className="text-xs text-white/60 mt-0.5">
            Completaste los primeros pasos y ganaste{" "}
            <span className="text-emerald-300 font-semibold">+{rp} RP</span> de bienvenida.
            Ya puedes usarlos en la tienda.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/store"
          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
        >
          Ver tienda →
        </Link>
        <button
          onClick={onDismiss}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 transition hover:bg-white/8"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Onboarding checklist ──────────────────────────────────────────────────────
function OnboardingChecklist({
  hasFirstPick,
  hasDailyLogin,
  hasTop10,
  welcomeBonusClaimed,
}: {
  hasFirstPick: boolean;
  hasDailyLogin: boolean;
  hasTop10: boolean;
  welcomeBonusClaimed: boolean;
}) {
  const steps = [
    { label: "Crea tu cuenta", done: true },
    { label: "Daily login", done: hasDailyLogin },
    { label: "Primer pick", done: hasFirstPick },
    { label: "Top 10", done: hasTop10 },
  ];

  const completed = steps.filter((s) => s.done).length;

  // Se oculta cuando ya reclamó el bonus (todos los pasos relevantes completados)
  // o cuando completó los 4 pasos
  if (welcomeBonusClaimed || completed === steps.length) return null;

  const nextStep = steps.find((s) => !s.done);

  return (
    <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Primeros pasos</div>
          <div className="text-xs text-white/45 mt-0.5">
            {completed} de {steps.length} completados
            {/* Mostrar la recompensa pendiente para motivar */}
            {!welcomeBonusClaimed && (
              <span className="ml-2 text-amber-300/80">· Completa el paso 3 y gana 25 RP 🎁</span>
            )}
          </div>
        </div>
        <div className="text-xs text-blue-300 font-semibold">
          {Math.round((completed / steps.length) * 100)}%
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      <div className="flex items-start mb-4">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border transition-all ${
                step.done
                  ? "bg-blue-500 border-blue-400 text-white"
                  : i === completed
                  ? "bg-blue-500/15 border-blue-400/40 text-blue-300"
                  : "bg-white/5 border-white/15 text-white/30"
              }`}>
                {step.done ? "✓" : i + 1}
              </div>
              <div className={`text-[9px] text-center leading-tight ${
                step.done ? "text-blue-300" : i === completed ? "text-white/55" : "text-white/25"
              }`}>
                {step.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 mx-1 mt-[-14px] transition-all ${
                step.done ? "bg-blue-500/50" : "bg-white/10"
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* CTA para el siguiente paso pendiente */}
      {nextStep && (
        <div className="flex items-center justify-between rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-white">
              {nextStep.label === "Primer pick" && "Haz tu primer pick y gana 25 RP"}
              {nextStep.label === "Daily login" && "Reclama tu recompensa diaria"}
              {nextStep.label === "Top 10" && "Sube al Top 10 del leaderboard"}
            </div>
            <div className="text-xs text-white/40 mt-0.5">
              {nextStep.label === "Primer pick" && "Únete a un torneo y elige un ganador"}
              {nextStep.label === "Daily login" && "Gana 5 RP solo por entrar"}
              {nextStep.label === "Top 10" && "Acumula picks correctos esta semana"}
            </div>
          </div>
          <Link
            href={
              nextStep.label === "Primer pick" ? "/tournaments"
              : nextStep.label === "Top 10" ? "/leaderboard"
              : "/dashboard"
            }
            className="ml-4 flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
          >
            Ir →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Mini Leaderboard ──────────────────────────────────────────────────────────
function MiniLeaderboard({
  weekId,
  currentUid,
}: {
  weekId: string;
  currentUid: string | null;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [activeSport, setActiveSport] = useState<"NBA" | "MLB">("NBA");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntries([]);

    async function load() {
      try {
        const q = query(
          collection(db, "leaderboardsEntries"),
          where("weekId", "==", weekId),
          where("sport", "==", activeSport),
          orderBy("points", "desc"),
          limit(5),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const rows = snap.docs.map((d) => ({ uid: d.data().uid, ...d.data() } as LeaderboardEntry));
        setEntries(rows);

        const names: Record<string, string> = {};
        await Promise.all(
          rows.map(async (entry) => {
            if (!entry.uid) return;
            try {
              const uSnap = await getDoc(doc(db, "users", entry.uid));
              if (uSnap.exists()) {
                const d = uSnap.data() as any;
                names[entry.uid] = d?.displayName || d?.username || entry.uid.slice(0, 12);
              }
            } catch {
              names[entry.uid] = entry.uid.slice(0, 12);
            }
          })
        );
        if (!cancelled) setUsernames(names);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [weekId, activeSport]);

  const maxPoints = entries[0]?.points ?? 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-white">Leaderboard</div>
        <div className="flex gap-1">
          {(["NBA", "MLB"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSport(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                activeSport === s
                  ? "bg-blue-600/25 text-blue-300 border border-blue-500/30"
                  : "text-white/35 hover:text-white/65"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-white/30">Cargando…</div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-xs text-white/30">Sin datos esta semana.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => {
            const rank = i + 1;
            const colors = rankColors(rank);
            const name = usernames[entry.uid] || entry.uid?.slice(0, 12) || "—";
            const isMe = entry.uid === currentUid;
            const barWidth = maxPoints > 0 ? Math.round((entry.points / maxPoints) * 100) : 0;
            const rankEmoji = ["🥇", "🥈", "🥉"][rank - 1];

            return (
              <div
                key={entry.uid}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  isMe ? "border-blue-400/30 bg-blue-500/10" : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}>
                  {rankEmoji ?? rank}
                </div>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${colors.bg} ${colors.text}`}>
                  {userInitials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${isMe ? "text-blue-200" : "text-white/75"}`}>
                    {name}{isMe && <span className="text-blue-400/60 text-[10px] ml-1">(tú)</span>}
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-white/8 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        rank === 1 ? "bg-amber-400" : rank === 2 ? "bg-slate-400" : rank === 3 ? "bg-orange-400" : "bg-blue-500/60"
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <div className={`text-xs font-bold flex-shrink-0 ${rank === 1 ? "text-amber-300" : "text-white/65"}`}>
                  {entry.points}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Link
          href={`/leaderboard/${activeSport.toLowerCase()}`}
          className="block w-full rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs text-white/55 transition hover:bg-white/8 hover:text-white/80"
        >
          Ver ranking completo →
        </Link>
      </div>
    </div>
  );
}

// ── Stats cards ───────────────────────────────────────────────────────────────
function StatsCards({
  rewardPoints,
  loadingRewards,
  winRate,
  loadingPicks,
  currentWeekPicks,
}: {
  rewardPoints: number;
  loadingRewards: boolean;
  winRate: number | null;
  loadingPicks: boolean;
  currentWeekPicks: PickDoc[];
}) {
  const marketStats = useMemo(() => {
    const resolved = currentWeekPicks.filter((p) => p.result && p.result !== "pending");
    return ["moneyline", "spread", "ou"].map((m) => {
      const picks = resolved.filter((p) => {
        const mkt = String(p.market ?? "").toLowerCase();
        return mkt === m || (m === "ou" && mkt === "total");
      });
      const wins = picks.filter((p) => p.result === "win").length;
      const rate = picks.length > 0 ? Math.round((wins / picks.length) * 100) : null;
      return { label: m === "moneyline" ? "ML" : m === "spread" ? "SP" : "O/U", rate, count: picks.length };
    });
  }, [currentWeekPicks]);

  const streak = useMemo(() => {
    const resolved = [...currentWeekPicks]
      .filter((p) => p.result && p.result !== "pending")
      .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    let count = 0;
    for (const p of resolved) {
      if (p.result === "win") count++;
      else break;
    }
    return count;
  }, [currentWeekPicks]);

  const bestMarket = useMemo(() => {
    return marketStats
      .filter((m) => m.rate !== null && m.count >= 1)
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0] ?? null;
  }, [marketStats]);

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <div className="rounded-2xl border border-amber-300/20 bg-[#161A22] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-amber-200/60 mb-2">Reward Points</div>
        <div className="text-3xl font-bold text-white">
          {loadingRewards ? "…" : rewardPoints.toLocaleString()}
        </div>
        <div className="mt-2 text-xs text-white/35">Total acumulado</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Win Rate</div>
        <div className="text-3xl font-bold text-white">
          {loadingPicks ? "…" : winRate === null ? "—" : `${winRate}%`}
        </div>
        {!loadingPicks && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {marketStats.map((m) => (
              <span key={m.label} className="text-[10px] text-white/30">
                <span className="text-white/50">{m.label}</span> {m.rate !== null ? `${m.rate}%` : "—"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Racha</div>
        <div className="text-3xl font-bold text-white flex items-end gap-1">
          {loadingPicks ? "…" : streak}
          {!loadingPicks && streak > 0 && <span className="text-xl mb-0.5">🔥</span>}
        </div>
        <div className="mt-2 text-xs text-white/35">
          {streak === 0 ? "Sin racha activa" : "Wins consecutivos"}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#121418] p-4 md:p-5">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Mejor mercado</div>
        <div className="text-2xl font-bold text-white mt-1">
          {loadingPicks ? "…" : bestMarket ? bestMarket.label : "—"}
        </div>
        <div className="mt-2 text-xs text-white/35">
          {bestMarket?.rate != null ? `${bestMarket.rate}% win rate` : "Sin datos aún"}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { plan, loading: entLoading } = useUserEntitlements();
  const currentWeekId = useMemo(() => getWeekId(new Date()), []);
  const currentWeekLabel = useMemo(() => getWeekRangeLabel(new Date(), "es-PR"), []);

  const [allPicks, setAllPicks] = useState<PickDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [rewardPoints, setRewardPoints] = useState<number>(0);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [dailyNotice, setDailyNotice] = useState<string | null>(null);
  const [hasDailyLogin, setHasDailyLogin] = useState(false);

  const [rewardHistory, setRewardHistory] = useState<RewardHistoryDoc[]>([]);
  const [loadingRewardHistory, setLoadingRewardHistory] = useState(true);

  // Welcome bonus state
  const [welcomeBonusClaimed, setWelcomeBonusClaimed] = useState(false);
  const [welcomeBonusLoading, setWelcomeBonusLoading] = useState(true);
  const [welcomeBannerRP, setWelcomeBannerRP] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPicks(userId: string) {
      setLoadingPicks(true);
      try {
        const qy = query(collection(db, "picks"), where("uid", "==", userId));
        const snap = await getDocs(qy);
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PickDoc[];
        rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setAllPicks(rows);
      } catch {
        if (!cancelled) setAllPicks([]);
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    }
    if (!uid) { setAllPicks([]); setLoadingPicks(false); return; }
    loadPicks(uid);
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    async function loadRewards(userId: string) {
      setLoadingRewards(true);
      try {
        const snap = await getDoc(doc(db, "users", userId));
        if (cancelled) return;
        const data = snap.exists() ? (snap.data() as any) : {};
        setRewardPoints(Number(data?.rewardPoints ?? 0));

        // Leer si ya reclamó el welcome bonus
        const alreadyClaimed = data?.welcomeBonusClaimed === true;
        setWelcomeBonusClaimed(alreadyClaimed);
        setWelcomeBonusLoading(false);
      } catch {
        if (!cancelled) { setRewardPoints(0); setWelcomeBonusLoading(false); }
      } finally {
        if (!cancelled) setLoadingRewards(false);
      }
    }
    if (!uid) {
      setRewardPoints(0);
      setLoadingRewards(false);
      setWelcomeBonusLoading(false);
      return;
    }
    loadRewards(uid);
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    async function loadRewardHistory(userId: string) {
      setLoadingRewardHistory(true);
      try {
        const qy = query(collection(db, "rewardHistory"), where("userId", "==", userId));
        const snap = await getDocs(qy);
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RewardHistoryDoc[];
        rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setRewardHistory(rows.slice(0, 6));
      } catch {
        if (!cancelled) setRewardHistory([]);
      } finally {
        if (!cancelled) setLoadingRewardHistory(false);
      }
    }
    if (!uid) { setRewardHistory([]); setLoadingRewardHistory(false); return; }
    loadRewardHistory(uid);
    return () => { cancelled = true; };
  }, [uid, dailyNotice, welcomeBannerRP]);

  useEffect(() => {
    let cancelled = false;
    async function claimDailyReward() {
      if (!uid) return;
      try {
        const fn = httpsCallable(functions, "claimDailyLoginReward");
        const res: any = await fn();
        const data = res?.data ?? {};
        if (cancelled) return;
        if (data?.claimed === true) {
          setDailyNotice(`Daily reward claimed: +${data?.awardedRP ?? 5} RP`);
          setRewardPoints((prev) => prev + Number(data?.awardedRP ?? 5));
        }
        setHasDailyLogin(true);
      } catch {
        setHasDailyLogin(true);
      }
    }
    claimDailyReward();
    return () => { cancelled = true; };
  }, [uid]);

  // ── Welcome bonus: se dispara automáticamente cuando:
  //    1) El usuario tiene al menos 1 pick (allPicks cargó)
  //    2) No ha reclamado el bonus antes (welcomeBonusClaimed === false)
  //    3) El estado del bonus ya cargó desde Firestore
  useEffect(() => {
    let cancelled = false;
    async function tryClaimWelcomeBonus() {
      if (!uid) return;
      if (welcomeBonusLoading) return;      // esperar a que cargue el estado
      if (welcomeBonusClaimed) return;      // ya lo reclamó, no hacer nada
      if (allPicks.length === 0) return;    // aún no tiene picks
      if (loadingPicks) return;             // picks aún cargando

      try {
        const fn = httpsCallable(functions, "claimWelcomeBonus");
        const res: any = await fn();
        const data = res?.data ?? {};
        if (cancelled) return;

        if (data?.claimed === true) {
          const rp = Number(data?.awardedRP ?? 25);
          setWelcomeBonusClaimed(true);
          setWelcomeBannerRP(rp);
          setRewardPoints((prev) => prev + rp);
        } else if (data?.reason === "already-claimed") {
          // Sincronizar estado local si Firestore dice que ya estaba reclamado
          setWelcomeBonusClaimed(true);
        }
      } catch {
        // silent — no bloquear si falla
      }
    }

    tryClaimWelcomeBonus();
    return () => { cancelled = true; };
  }, [uid, allPicks.length, welcomeBonusClaimed, welcomeBonusLoading, loadingPicks]);

  const currentWeekPicks = useMemo(() => {
    return allPicks.filter((p) => String(p.weekId ?? "") === currentWeekId);
  }, [allPicks, currentWeekId]);

  const winRate = useMemo(() => {
    const resolved = currentWeekPicks.filter((p) => p.result && p.result !== "pending");
    if (!resolved.length) return null;
    const wins = resolved.filter((p) => p.result === "win").length;
    return Math.round((wins / resolved.length) * 100);
  }, [currentWeekPicks]);

  const activePicks = useMemo(() => {
    return currentWeekPicks.filter((p) => (p.result ?? "pending") === "pending").length;
  }, [currentWeekPicks]);

  const resolvedCount = useMemo(() => {
    return currentWeekPicks.filter((p) => (p.result ?? "pending") !== "pending").length;
  }, [currentWeekPicks]);

  const earnedTotal = useMemo(() => {
    return rewardHistory.reduce((sum, item) => {
      const amount = Number(item.amount ?? 0);
      return amount > 0 ? sum + amount : sum;
    }, 0);
  }, [rewardHistory]);

  const redeemedTotal = useMemo(() => {
    return Math.abs(
      rewardHistory.reduce((sum, item) => {
        const amount = Number(item.amount ?? 0);
        return amount < 0 ? sum + amount : sum;
      }, 0),
    );
  }, [rewardHistory]);

  const hasFirstPick = allPicks.length > 0;

  return (
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
            {loadingRewards ? "…" : rewardPoints.toLocaleString()} RP
          </span>
        </div>
      </div>

      {/* Daily notice */}
      {dailyNotice && (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {dailyNotice}
        </div>
      )}

      {/* Welcome bonus banner — aparece solo cuando acaba de ganar el bonus */}
      {welcomeBannerRP !== null && (
        <WelcomeBonusBanner
          rp={welcomeBannerRP}
          onDismiss={() => setWelcomeBannerRP(null)}
        />
      )}

      {/* Onboarding — se oculta cuando welcomeBonusClaimed === true */}
      <OnboardingChecklist
        hasFirstPick={hasFirstPick}
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

      {/* Bottom grid 3 columnas */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">

        {/* Reward History */}
        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Reward History</div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  +{earnedTotal} RP
                </span>
                <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                  -{redeemedTotal} RP
                </span>
              </div>
            </div>
            <Link
              href="/redeems"
              className="flex-shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 transition hover:bg-white/8"
            >
              Ver todo →
            </Link>
          </div>

          <div className="space-y-2">
            {loadingRewardHistory ? (
              <div className="py-6 text-center text-xs text-white/30">Cargando…</div>
            ) : rewardHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/35">
                Aún no tienes movimientos.
              </div>
            ) : (
              rewardHistory.map((item) => {
                const amount = Number(item.amount ?? 0);
                const positive = amount >= 0;
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-sm">
                        {getRewardIcon(item.type)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-white/80">
                          {(item.description || formatRewardType(item.type)).slice(0, 38)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-white/30">
                          {formatRewardDate(item.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className={`ml-3 text-xs font-bold flex-shrink-0 ${positive ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatRewardAmount(amount)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-sm font-semibold text-white mb-4">Quick Actions</div>
          <div className="flex flex-col gap-2">
            <Link href="/tournaments" className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200 transition hover:bg-blue-500/15 flex items-center justify-between">
              <span>Ir a Tournaments</span><span className="text-blue-400/50">→</span>
            </Link>
            <Link href="/store" className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 transition hover:bg-amber-400/15 flex items-center justify-between">
              <span>Canjear Rewards</span><span className="text-amber-400/50">→</span>
            </Link>
            <Link href="/picks" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65 transition hover:bg-white/6 flex items-center justify-between">
              <span>Ver mis Picks</span><span className="text-white/25">→</span>
            </Link>
            <Link href="/leaderboard" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65 transition hover:bg-white/6 flex items-center justify-between">
              <span>Leaderboard completo</span><span className="text-white/25">→</span>
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
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

        {/* Mini Leaderboard */}
        <div className="lg:col-span-1">
          <MiniLeaderboard weekId={currentWeekId} currentUid={uid} />
        </div>
      </div>
    </div>
  );
}
