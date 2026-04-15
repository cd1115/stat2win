"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  Timestamp,
} from "firebase/firestore";

import { cn } from "@/lib/cn";

type RedeemDoc = {
  id: string;
  uid: string;
  productId: string;
  title?: string;
  pointsCost: number;
  status:
    | "pending"
    | "fulfilled"
    | "created"
    | "shipped"
    | "delivered"
    | "cancelled"
    | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type RewardHistoryDoc = {
  id: string;
  userId: string;
  type?: string;
  amount?: number;
  description?: string;
  createdAt?: Timestamp;
  weekId?: string;
  sport?: string;
  wins?: number;
  pushes?: number;
  plan?: string;
};

type RewardFilter = "all" | "daily_login" | "leaderboard_reward";

const PAGE_SIZE = 10;

function formatDate(ts?: Timestamp) {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRewardType(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t === "daily_login") return "Daily Login";
  if (t === "leaderboard_reward") return "Tournament Reward";
  if (t === "pick_reward") return "Pick Reward";
  if (t === "redeem") return "Store Redemption";
  return "Reward";
}

function getRewardIcon(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t === "daily_login") return "🎁";
  if (t === "leaderboard_reward") return "🏆";
  if (t === "pick_reward") return "✅";
  if (t === "redeem") return "🛒";
  return "✨";
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "bg-amber-500/15 text-amber-200 border-amber-500/20",
    },
    created: {
      label: "Pending",
      cls: "bg-amber-500/15 text-amber-200 border-amber-500/20",
    },
    shipped: {
      label: "Shipped",
      cls: "bg-sky-500/15 text-sky-200 border-sky-500/20",
    },
    delivered: {
      label: "Delivered",
      cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
    },
    fulfilled: {
      label: "Fulfilled",
      cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-red-500/15 text-red-200 border-red-500/20",
    },
  };
  const fallback = {
    label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "Pending",
    cls: "bg-amber-500/15 text-amber-200 border-amber-500/20",
  };
  const { label, cls } = map[s] ?? fallback;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121418] p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  );
}

export default function RedeemsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userRp, setUserRp] = useState<number | null>(null);

  const [redeemItems, setRedeemItems] = useState<RedeemDoc[]>([]);
  const [loadingRedeems, setLoadingRedeems] = useState(true);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

  const [rewardItems, setRewardItems] = useState<RewardHistoryDoc[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [rewardErr, setRewardErr] = useState<string | null>(null);

  const [rewardFilter, setRewardFilter] = useState<RewardFilter>("all");
  const [rewardPage, setRewardPage] = useState(0);

  useEffect(() => {
    const auth = getAuth(getApp());
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  // Listen to user doc for accurate rewardPoints total
  useEffect(() => {
    if (!uid) {
      setUserRp(null);
      return;
    }
    const db = getFirestore(getApp());
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const rp = snap.data()?.rewardPoints;
        setUserRp(typeof rp === "number" ? rp : null);
      },
      () => {},
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    setRedeemErr(null);
    if (loadingAuth) return;
    if (!uid) {
      setRedeemItems([]);
      setLoadingRedeems(false);
      return;
    }

    const db = getFirestore(getApp());
    const qy = query(
      collection(db, "redeems"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    setLoadingRedeems(true);

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRedeemItems(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              uid: data.uid,
              productId: data.productId,
              title: data.title,
              pointsCost: Number(data.pointsCost || 0),
              status: data.status || "pending",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            };
          }),
        );
        setLoadingRedeems(false);
      },
      (e) => {
        setRedeemErr(e?.message || "Failed to load redeems");
        setLoadingRedeems(false);
      },
    );

    return () => unsub();
  }, [uid, loadingAuth]);

  useEffect(() => {
    setRewardErr(null);
    if (loadingAuth) return;
    if (!uid) {
      setRewardItems([]);
      setLoadingRewards(false);
      return;
    }

    const db = getFirestore(getApp());
    const qy = query(
      collection(db, "rewardHistory"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(200),
    );
    setLoadingRewards(true);

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRewardItems(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              userId: data.userId,
              type: data.type,
              amount: Number(data.amount || 0),
              description: data.description,
              createdAt: data.createdAt,
              weekId: data.weekId,
              sport: data.sport,
              wins: data.wins,
              pushes: data.pushes,
              plan: data.plan,
            };
          }),
        );
        setLoadingRewards(false);
      },
      (e) => {
        setRewardErr(e?.message || "Failed to load rewards");
        setLoadingRewards(false);
      },
    );

    return () => unsub();
  }, [uid, loadingAuth]);

  const earnedOnly = useMemo(
    () => rewardItems.filter((r) => Number(r.amount || 0) > 0),
    [rewardItems],
  );
  const totalEarned = useMemo(
    () => earnedOnly.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    [earnedOnly],
  );
  const totalSpent = useMemo(
    () => redeemItems.reduce((sum, r) => sum + Number(r.pointsCost || 0), 0),
    [redeemItems],
  );
  const balance = totalEarned - totalSpent;
  const dailyRewardsCount = useMemo(
    () =>
      earnedOnly.filter(
        (r) => String(r.type || "").toLowerCase() === "daily_login",
      ).length,
    [earnedOnly],
  );
  const tournamentRewardsCount = useMemo(
    () =>
      earnedOnly.filter(
        (r) => String(r.type || "").toLowerCase() === "leaderboard_reward",
      ).length,
    [earnedOnly],
  );

  // ✅ Filtrado por tipo
  const filteredRewards = useMemo(() => {
    if (rewardFilter === "all") return earnedOnly;
    return earnedOnly.filter(
      (r) => String(r.type || "").toLowerCase() === rewardFilter,
    );
  }, [earnedOnly, rewardFilter]);

  // ✅ Paginación
  const totalPages = Math.ceil(filteredRewards.length / PAGE_SIZE);
  const pagedRewards = useMemo(
    () =>
      filteredRewards.slice(
        rewardPage * PAGE_SIZE,
        (rewardPage + 1) * PAGE_SIZE,
      ),
    [filteredRewards, rewardPage],
  );

  // Reset page on filter change
  useEffect(() => setRewardPage(0), [rewardFilter]);

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-sm text-white/60">
              <span className="h-2 w-2 rounded-full bg-blue-500/70" />
              Rewards
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              My Rewards
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Points earned from daily rewards and tournaments, plus your store
              redemptions.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/store"
              className="rounded-xl border border-white/10 bg-[#1A1F29] px-4 py-2 text-sm text-white/85 hover:border-white/20 hover:bg-[#222836]"
            >
              Open store
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        {/* ✅ Stats Cards */}
        {uid && !loadingRewards && !loadingRedeems && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Total Earned"
              value={`${(userRp ?? totalEarned).toLocaleString()} RP`}
              sub={`${earnedOnly.length} transactions`}
              color="text-emerald-300"
            />
            <StatCard
              label="Total Spent"
              value={`${totalSpent.toLocaleString()} RP`}
              sub={`${redeemItems.length} redeems`}
              color="text-amber-300"
            />

            <StatCard
              label="Daily Streaks"
              value={`${dailyRewardsCount}`}
              sub={`${tournamentRewardsCount} tournament rewards`}
              color="text-blue-300"
            />
          </div>
        )}

        <div className="mt-6 space-y-6">
          {!uid && !loadingAuth && (
            <div className="rounded-3xl border border-white/10 bg-[#121418] p-6">
              <div className="text-sm font-semibold">Login required</div>
              <div className="mt-1 text-sm text-white/65">
                Please{" "}
                <Link
                  href="/login"
                  className="underline text-white underline-offset-2"
                >
                  login
                </Link>{" "}
                to view your rewards.
              </div>
            </div>
          )}

          {rewardErr && (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
              {rewardErr}
            </div>
          )}
          {redeemErr && (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
              {redeemErr}
            </div>
          )}

          {uid && (loadingAuth || loadingRewards || loadingRedeems) && (
            <div className="rounded-3xl border border-white/10 bg-[#121418] p-6 text-sm text-white/70">
              Loading rewards activity...
            </div>
          )}

          {/* ✅ Rewards Earned con filtros y paginación */}
          {uid && !loadingRewards && (
            <section className="rounded-3xl border border-white/10 bg-[#121418] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold">Rewards Earned</div>
                  <p className="mt-1 text-sm text-white/60">
                    Daily login rewards, tournament rewards and other activity.
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 self-start sm:self-auto">
                  +{totalEarned.toLocaleString()} pts
                </span>
              </div>

              {/* ✅ Filtros */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    { key: "all", label: "All", count: earnedOnly.length },
                    {
                      key: "daily_login",
                      label: "🎁 Daily Login",
                      count: dailyRewardsCount,
                    },
                    {
                      key: "leaderboard_reward",
                      label: "🏆 Tournament",
                      count: tournamentRewardsCount,
                    },
                  ] as { key: RewardFilter; label: string; count: number }[]
                ).map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setRewardFilter(key)}
                    className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                      rewardFilter === key
                        ? "border-white/20 bg-white/10 text-white"
                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {label} <span className="ml-1 text-white/40">{count}</span>
                  </button>
                ))}
              </div>

              {filteredRewards.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-[#0F1115] p-5 text-sm text-white/55">
                  No rewards found for this filter.
                </div>
              ) : (
                <>
                  <div className="mt-4 space-y-2">
                    {pagedRewards.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F1115] px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#1A1F29] text-lg">
                            {getRewardIcon(item.type)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {item.description || formatRewardType(item.type)}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-white/50">
                              <span>{formatRewardType(item.type)}</span>
                              {item.sport && (
                                <>
                                  <span className="text-white/25">•</span>
                                  <span>{item.sport}</span>
                                </>
                              )}
                              {item.weekId && (
                                <>
                                  <span className="text-white/25">•</span>
                                  <span>{item.weekId}</span>
                                </>
                              )}
                              <span className="text-white/25">•</span>
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ml-4 shrink-0 text-sm font-bold text-emerald-300">
                          +{Number(item.amount || 0).toLocaleString()} pts
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ✅ Paginación */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-white/40">
                        {rewardPage * PAGE_SIZE + 1}–
                        {Math.min(
                          (rewardPage + 1) * PAGE_SIZE,
                          filteredRewards.length,
                        )}{" "}
                        of {filteredRewards.length}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setRewardPage((p) => Math.max(0, p - 1))
                          }
                          disabled={rewardPage === 0}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-30"
                        >
                          ← Prev
                        </button>
                        <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70">
                          {rewardPage + 1} / {totalPages}
                        </span>
                        <button
                          onClick={() =>
                            setRewardPage((p) =>
                              Math.min(totalPages - 1, p + 1),
                            )
                          }
                          disabled={rewardPage >= totalPages - 1}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-30"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Redeemed Items */}
          {uid && !loadingRedeems && (
            <section className="rounded-3xl border border-white/10 bg-[#121418] p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Redeemed Items</div>
                  <p className="mt-1 text-sm text-white/60">
                    Store items you have redeemed and their delivery status.
                  </p>
                </div>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                  -{totalSpent.toLocaleString()} pts
                </span>
              </div>

              {redeemItems.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-[#0F1115] p-5 text-sm text-white/55">
                  No redeems yet. Go to the store and redeem your first item.
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0F1115]">
                  <div className="hidden grid-cols-12 border-b border-white/10 px-5 py-3 text-xs text-white/60 sm:grid">
                    <div className="col-span-6">Item</div>
                    <div className="col-span-2 text-right">Points</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2 text-right">Date</div>
                  </div>
                  <div className="divide-y divide-white/10">
                    {redeemItems.map((r) => (
                      <div key={r.id} className="px-5 py-4">
                        <div className="hidden grid-cols-12 items-center sm:grid">
                          <div className="col-span-6">
                            <div className="text-sm font-semibold">
                              {r.title || r.productId}
                            </div>
                            <div className="mt-1 text-xs text-white/55">
                              <Link
                                href={`/store/${r.productId}`}
                                className="text-white/75 hover:text-white underline-offset-2 hover:underline"
                              >
                                View product
                              </Link>
                              <span className="mx-2 text-white/35">•</span>
                              <span className="text-white/55">
                                Redeem ID: {r.id}
                              </span>
                            </div>
                          </div>
                          <div className="col-span-2 text-right text-sm font-semibold text-amber-200">
                            {Number(r.pointsCost || 0).toLocaleString()}
                          </div>
                          <div className="col-span-2">
                            <StatusPill status={r.status} />
                          </div>
                          <div className="col-span-2 text-right text-xs text-white/60">
                            {formatDate(r.createdAt)}
                          </div>
                        </div>
                        <div className="space-y-2 sm:hidden">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">
                                {r.title || r.productId}
                              </div>
                              <div className="mt-1 text-xs text-white/55">
                                <span className="text-amber-200">
                                  {Number(r.pointsCost || 0).toLocaleString()}{" "}
                                  pts
                                </span>
                                <span className="mx-2 text-white/35">•</span>
                                <span className="text-white/60">
                                  {formatDate(r.createdAt)}
                                </span>
                              </div>
                            </div>
                            <StatusPill status={r.status} />
                          </div>
                          <div className="text-xs text-white/55">
                            <Link
                              href={`/store/${r.productId}`}
                              className="text-white/75 hover:text-white underline-offset-2 hover:underline"
                            >
                              View product
                            </Link>
                            <span className="mx-2 text-white/35">•</span>
                            <span className="text-white/55">
                              Redeem ID: {r.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
