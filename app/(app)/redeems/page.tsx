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

function formatDate(ts?: Timestamp) {
  if (!ts) return "—";
  return ts.toDate().toLocaleString();
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

export default function RedeemsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [redeemItems, setRedeemItems] = useState<RedeemDoc[]>([]);
  const [loadingRedeems, setLoadingRedeems] = useState(true);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

  const [rewardItems, setRewardItems] = useState<RewardHistoryDoc[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(true);
  const [rewardErr, setRewardErr] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth(getApp());
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

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
        const rows: RedeemDoc[] = snap.docs.map((d) => {
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
        });

        setRedeemItems(rows);
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
      limit(100),
    );

    setLoadingRewards(true);

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: RewardHistoryDoc[] = snap.docs.map((d) => {
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
        });

        setRewardItems(rows);
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

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-sm text-white/60">
              <span className="h-2 w-2 rounded-full bg-blue-500/70" />
              Rewards
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              My Rewards
            </h1>
            <p className="mt-2 max-w-2xl text-white/65">
              See the points you have earned from daily rewards and tournaments,
              plus the items you have redeemed in the store.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
                Points earned:{" "}
                <span className="text-emerald-200">
                  {totalEarned.toLocaleString()}
                </span>
              </span>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1">
                Points spent:{" "}
                <span className="text-amber-200">
                  {totalSpent.toLocaleString()}
                </span>
              </span>
              <span className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1">
                Daily claims:{" "}
                <span className="text-white/85">{dailyRewardsCount}</span>
              </span>
              <span className="rounded-full border border-white/10 bg-[#1A1F29] px-3 py-1">
                Tournament rewards:{" "}
                <span className="text-white/85">{tournamentRewardsCount}</span>
              </span>
            </div>
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

        <div className="mt-8 space-y-6">
          {!uid && !loadingAuth ? (
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
          ) : null}

          {rewardErr ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
              {rewardErr}
            </div>
          ) : null}

          {redeemErr ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
              {redeemErr}
            </div>
          ) : null}

          {uid && (loadingAuth || loadingRewards || loadingRedeems) ? (
            <div className="rounded-3xl border border-white/10 bg-[#121418] p-6 text-sm text-white/70">
              Loading rewards activity...
            </div>
          ) : null}

          {uid && !loadingRewards ? (
            <section className="rounded-3xl border border-white/10 bg-[#121418] p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Rewards Earned</div>
                  <p className="mt-1 text-sm text-white/60">
                    Daily login rewards, tournament rewards and other positive
                    point activity.
                  </p>
                </div>

                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  +{totalEarned.toLocaleString()} pts
                </span>
              </div>

              {earnedOnly.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-[#0F1115] p-5 text-sm text-white/55">
                  No earned rewards yet. When the user claims daily login or
                  receives tournament rewards, they will appear here.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {earnedOnly.map((item) => (
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

                          <div className="mt-1 text-xs text-white/55">
                            {formatRewardType(item.type)}
                            {item.sport ? (
                              <>
                                <span className="mx-2 text-white/35">•</span>
                                <span>{item.sport}</span>
                              </>
                            ) : null}
                            {item.weekId ? (
                              <>
                                <span className="mx-2 text-white/35">•</span>
                                <span>{item.weekId}</span>
                              </>
                            ) : null}
                            <span className="mx-2 text-white/35">•</span>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 text-right text-sm font-semibold text-emerald-300">
                        +{Number(item.amount || 0).toLocaleString()} pts
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {uid && !loadingRedeems ? (
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
          ) : null}
        </div>
      </div>
    </main>
  );
}