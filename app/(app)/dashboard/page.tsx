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
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";

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

function getMillis(value: any) {
  return typeof value?.toMillis === "function" ? value.toMillis() : 0;
}

function formatRewardAmount(amount?: number) {
  const n = Number(amount ?? 0);
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function formatRewardType(type?: string) {
  const t = String(type ?? "").toLowerCase();

  if (t === "daily_login") return "Daily Login";
  if (t === "leaderboard_reward") return "Leaderboard Reward";
  if (t === "redeem") return "Store Redemption";
  if (t === "pick_reward") return "Correct Pick";

  return type ?? "Reward";
}

function getRewardIcon(type?: string) {
  const t = String(type ?? "").toLowerCase();

  if (t === "daily_login") return "🎁";
  if (t === "leaderboard_reward") return "🏆";
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

export default function DashboardPage() {
  const { plan, loading: entLoading } = useUserEntitlements();

  const [allPicks, setAllPicks] = useState<PickDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [rewardPoints, setRewardPoints] = useState<number>(0);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [dailyNotice, setDailyNotice] = useState<string | null>(null);

  const [rewardHistory, setRewardHistory] = useState<RewardHistoryDoc[]>([]);
  const [loadingRewardHistory, setLoadingRewardHistory] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
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

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as PickDoc[];

        rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setAllPicks(rows);
      } catch {
        if (!cancelled) setAllPicks([]);
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    }

    if (!uid) {
      setAllPicks([]);
      setLoadingPicks(false);
      return;
    }

    loadPicks(uid);

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadRewards(userId: string) {
      setLoadingRewards(true);
      try {
        const ref = doc(db, "users", userId);
        const snap = await getDoc(ref);

        if (cancelled) return;

        const data = snap.exists() ? (snap.data() as any) : {};
        setRewardPoints(Number(data?.rewardPoints ?? 0));
      } catch {
        if (!cancelled) setRewardPoints(0);
      } finally {
        if (!cancelled) setLoadingRewards(false);
      }
    }

    if (!uid) {
      setRewardPoints(0);
      setLoadingRewards(false);
      return;
    }

    loadRewards(uid);

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadRewardHistory(userId: string) {
      setLoadingRewardHistory(true);

      try {
        const qy = query(
          collection(db, "rewardHistory"),
          where("userId", "==", userId),
        );
        const snap = await getDocs(qy);

        if (cancelled) return;

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as RewardHistoryDoc[];

        rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setRewardHistory(rows.slice(0, 6));
      } catch {
        if (!cancelled) setRewardHistory([]);
      } finally {
        if (!cancelled) setLoadingRewardHistory(false);
      }
    }

    if (!uid) {
      setRewardHistory([]);
      setLoadingRewardHistory(false);
      return;
    }

    loadRewardHistory(uid);

    return () => {
      cancelled = true;
    };
  }, [uid, dailyNotice]);

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
      } catch {
        // silent fail
      }
    }

    claimDailyReward();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const winRate = useMemo(() => {
    const resolved = allPicks.filter((p) => p.result && p.result !== "pending");
    if (!resolved.length) return null;
    const wins = resolved.filter((p) => p.result === "win").length;
    return Math.round((wins / resolved.length) * 100);
  }, [allPicks]);

  const activePicks = useMemo(() => {
    return allPicks.filter((p) => (p.result ?? "pending") === "pending").length;
  }, [allPicks]);

  const resolvedCount = useMemo(() => {
    return allPicks.filter((p) => (p.result ?? "pending") !== "pending").length;
  }, [allPicks]);

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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-white/60">
            Tu progreso y recompensas recientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1 text-xs text-white/70">
            Plan: {plan.toUpperCase()}
          </span>
          <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
            {loadingRewards ? "…" : rewardPoints} RP
          </span>
        </div>
      </div>

      {dailyNotice ? (
        <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {dailyNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-300/20 bg-[#161A22] p-5">
          <div className="text-xs text-amber-200/80">Reward Points</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {loadingRewards ? "…" : rewardPoints}
          </div>
          <div className="mt-2 text-sm text-white/50">
            Úsalos para redimir artículos en la tienda.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-xs text-white/60">Win Rate</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {loadingPicks ? "…" : winRate === null ? "—" : `${winRate}%`}
          </div>
          <div className="mt-2 text-sm text-white/50">
            Calculado con tus picks resueltos.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-xs text-white/60">Active Picks</div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {loadingPicks ? "…" : activePicks}
          </div>
          <div className="mt-2 text-sm text-white/50">
            Picks pendientes totales.
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">
                Reward History
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                  Earned: +{earnedTotal} RP
                </span>
                <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-200">
                  Redeemed: -{redeemedTotal} RP
                </span>
              </div>
            </div>

            <Link
              href="/redeems"
              className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1.5 text-xs text-white/70 transition hover:bg-[#222836]"
            >
              View All →
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {loadingRewardHistory ? (
              <div className="text-sm text-white/50">Cargando…</div>
            ) : rewardHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#0F1115] px-4 py-6 text-sm text-white/50">
                Aún no tienes movimientos de rewards. Cuando reclames daily
                login, ganes leaderboard o redimas en la tienda, aparecerán
                aquí.
              </div>
            ) : (
              rewardHistory.map((item) => {
                const amount = Number(item.amount ?? 0);
                const positive = amount >= 0;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0F1115] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#1A1F29] text-lg">
                        {getRewardIcon(item.type)}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">
                          {item.description || formatRewardType(item.type)}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          {formatRewardType(item.type)} •{" "}
                          {formatRewardDate(item.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 text-right">
                      <div
                        className={`text-sm font-semibold ${
                          positive ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {formatRewardAmount(amount)} RP
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-sm font-medium text-white">Quick Actions</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/tournaments/nba"
              className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200 transition hover:bg-blue-500/15"
            >
              Go to NBA Tournament →
            </Link>

            <Link
              href="/store"
              className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 transition hover:bg-amber-400/15"
            >
              Redeem Rewards →
            </Link>

            <Link
              href="/picks"
              className="rounded-xl border border-white/10 bg-[#0F1115] px-4 py-3 text-sm text-white/80 transition hover:bg-[#1A1F29]"
            >
              View My Picks →
            </Link>

            <Link
              href="/leaderboard/nba"
              className="rounded-xl border border-white/10 bg-[#0F1115] px-4 py-3 text-sm text-white/80 transition hover:bg-[#1A1F29]"
            >
              Open Leaderboard →
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#0F1115] p-4">
              <div className="text-xs text-white/60">Resolved Picks</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {loadingPicks ? "…" : resolvedCount}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0F1115] p-4">
              <div className="text-xs text-white/60">Plan Bonus</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {entLoading
                  ? "…"
                  : plan.toUpperCase() === "PREMIUM"
                    ? "Premium"
                    : "Free"}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-white/50">
            Aquí luego podemos añadir streaks, progreso de redención y rewards
            por achievements.
          </div>
        </div>
      </div>
    </div>
  );
}