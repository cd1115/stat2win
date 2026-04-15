"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { auth, db } from "@/lib/firebase";
import {
  STORE_CATEGORIES,
  STORE_PRODUCTS,
  type StoreCategory,
  type StoreProduct,
} from "@/lib/store-catalog";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

type RedeemState =
  | { status: "idle" }
  | { status: "loading"; productId: string }
  | { status: "success"; productId: string; message: string }
  | { status: "error"; productId: string; message: string };

function errorToMessage(e: any) {
  const msg = String(e?.message || "");
  const m = msg.toLowerCase();
  if (m.includes("not enough points")) return "Not enough points.";
  if (m.includes("premium required")) return "Premium required.";
  if (m.includes("unauthenticated")) return "Please login first.";
  return msg || "Redeem failed.";
}

function isValidAddress(a?: any) {
  if (!a) return false;
  return (
    (a.line1?.trim()?.length ?? 0) > 3 &&
    (a.city?.trim()?.length ?? 0) > 1 &&
    (a.state?.trim()?.length ?? 0) > 1 &&
    (a.zip?.trim()?.length ?? 0) > 2 &&
    (a.country?.trim()?.length ?? 0) > 1
  );
}

function ShippingRequiredModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-[92%] max-w-md rounded-3xl border border-white/10 bg-[#0d1117] p-6">
        <div className="text-lg font-bold text-white">
          Shipping address required
        </div>
        <p className="mt-2 text-sm text-white/60">
          To redeem physical rewards, please add your shipping address in
          Settings first.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/settings"
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-500 transition"
          >
            Go to Settings
          </Link>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-white/70 hover:bg-white/10 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Points progress bar ──────────────────────────────────────────────────────
function PointsBar({
  points,
  products,
}: {
  points: number;
  products: StoreProduct[];
}) {
  const rewardProducts = products.filter((p) => p.pointsCost);
  const sorted = [...rewardProducts].sort(
    (a, b) => (a.pointsCost ?? 0) - (b.pointsCost ?? 0),
  );
  const maxCost = sorted[sorted.length - 1]?.pointsCost ?? 10000;
  const nextUnlock = sorted.find((p) => (p.pointsCost ?? 0) > points);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1117] px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-white/40 uppercase tracking-wider">
            Your Balance
          </div>
          <div className="mt-0.5 text-2xl font-black text-white">
            {points.toLocaleString()}{" "}
            <span className="text-sm font-normal text-amber-400">RP</span>
          </div>
        </div>
        {nextUnlock && (
          <div className="text-right">
            <div className="text-xs text-white/40">Next reward</div>
            <div className="text-sm font-semibold text-white/70">
              {nextUnlock.title}
            </div>
            <div className="text-xs text-amber-400">
              {((nextUnlock.pointsCost ?? 0) - points).toLocaleString()} RP away
            </div>
          </div>
        )}
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
          style={{ width: `${Math.min(100, (points / maxCost) * 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-white/30">
        <span>0</span>
        <span>{maxCost.toLocaleString()} RP</span>
      </div>
    </div>
  );
}

export default function StoreAppPage() {
  const router = useRouter();
  const {
    isAuthed,
    plan,
    points: entitlementPoints,
    loading,
  } = useUserEntitlements();

  // Live rewardPoints directly from users/{uid} — matches navbar
  const [liveRp, setLiveRp] = useState<number | null>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.uid) {
        setLiveRp(null);
        return;
      }
      const unsub2 = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          const rp = snap.data()?.rewardPoints;
          setLiveRp(typeof rp === "number" ? rp : null);
        },
        () => {},
      );
      return () => unsub2();
    });
    return () => unsub();
  }, []);

  const points = liveRp ?? entitlementPoints;

  const [cat, setCat] = useState<StoreCategory>("trending");
  const [redeem, setRedeem] = useState<RedeemState>({ status: "idle" });
  const [showShippingModal, setShowShippingModal] = useState(false);

  const isPremium = plan === "premium";

  const products = useMemo(() => {
    if (cat === "trending") return STORE_PRODUCTS;
    return STORE_PRODUCTS.filter((p) => p.category === cat);
  }, [cat]);

  const redeemFn = useMemo(
    () => httpsCallable(getFunctions(getApp()), "redeemProduct"),
    [],
  );

  const onUpgrade = useCallback(() => router.push("/subscription"), [router]);

  const onRedeem = useCallback(
    async (product: StoreProduct) => {
      if (!product.pointsCost) return;
      if (!auth.currentUser?.uid) {
        setRedeem({
          status: "error",
          productId: product.id,
          message: "Please login first.",
        });
        setTimeout(() => setRedeem({ status: "idle" }), 2500);
        return;
      }
      if (typeof points === "number" && product.pointsCost > points) {
        setRedeem({
          status: "error",
          productId: product.id,
          message: "Not enough points.",
        });
        setTimeout(() => setRedeem({ status: "idle" }), 2500);
        return;
      }
      if ((product as any).requiresShipping === true) {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = snap.exists() ? snap.data() : null;
        const requireShipping =
          (data as any)?.preferences?.requireShippingForRewards ?? true;
        if (requireShipping && !isValidAddress((data as any)?.address)) {
          setShowShippingModal(true);
          return;
        }
      }
      setRedeem({ status: "loading", productId: product.id });
      try {
        await redeemFn({
          productId: product.id,
          pointsCost: product.pointsCost,
        });
        setRedeem({
          status: "success",
          productId: product.id,
          message: "Redeemed! ✅",
        });
      } catch (e: any) {
        setRedeem({
          status: "error",
          productId: product.id,
          message: errorToMessage(e),
        });
      } finally {
        setTimeout(() => setRedeem({ status: "idle" }), 2500);
      }
    },
    [points, redeemFn],
  );

  return (
    <>
      <ShippingRequiredModal
        open={showShippingModal}
        onClose={() => setShowShippingModal(false)}
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-white/40 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Reward Store
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
              Shop the Game
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Redeem with Reward Points or buy instantly. Earn more by making
              correct picks.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isPremium && (
              <button
                onClick={onUpgrade}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-300 hover:bg-blue-500/20 transition"
              >
                ✦ Upgrade Premium
              </button>
            )}
            {isPremium && (
              <span className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-300">
                ✦ Premium
              </span>
            )}
          </div>
        </div>

        {/* ── Points Balance Bar ─────────────────────────────────────── */}
        {!loading && (
          <div className="mt-6">
            <PointsBar points={points} products={STORE_PRODUCTS} />
          </div>
        )}

        {/* ── Not logged in banner ───────────────────────────────────── */}
        {!isAuthed && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            ⚠️ Please{" "}
            <Link href="/login" className="underline font-semibold">
              log in
            </Link>{" "}
            to redeem points.
          </div>
        )}

        {/* ── Categories ────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-2">
          {STORE_CATEGORIES.map((c) => {
            const active = c.key === cat;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-medium transition",
                  active
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-black/20 text-white/55 hover:bg-white/5 hover:text-white/80",
                )}
              >
                {c.emoji ? `${c.emoji} ` : ""}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* ── Product Grid ──────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => {
            const isLoading =
              redeem.status === "loading" && redeem.productId === p.id;
            const isSuccess =
              redeem.status === "success" && redeem.productId === p.id;
            const isError =
              redeem.status === "error" && redeem.productId === p.id;
            const showPoints = typeof p.pointsCost === "number";
            const showPrice = typeof p.priceUSD === "number";
            const canAfford = showPoints && points >= (p.pointsCost ?? 0);
            const isPremiumLocked = (p as any).premiumOnly && !isPremium;

            return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-2xl border bg-[#0d1117] transition",
                  isPremiumLocked
                    ? "border-purple-500/20 opacity-80"
                    : "border-white/10 hover:border-white/20",
                )}
              >
                {/* Premium locked overlay */}
                {isPremiumLocked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
                    <div className="text-2xl mb-2">🔒</div>
                    <div className="text-xs font-bold text-purple-300">
                      Premium Only
                    </div>
                    <button
                      onClick={onUpgrade}
                      className="mt-3 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition"
                    >
                      Upgrade
                    </button>
                  </div>
                )}

                {/* Badges */}
                <div className="flex items-center gap-1.5 p-3 pb-0">
                  {(p as any).premiumOnly && (
                    <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                      ✦ Premium
                    </span>
                  )}
                  {showPoints && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      Reward
                    </span>
                  )}
                  {!showPoints && showPrice && (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      Buy
                    </span>
                  )}
                  {(p as any).requiresShipping && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
                      Ships
                    </span>
                  )}
                </div>

                {/* Image */}
                <Link
                  href={`/store/${p.id}`}
                  className="mx-3 mt-2 block h-36 rounded-xl border border-white/10 bg-black/40 transition hover:border-white/20"
                >
                  {/* product image goes here */}
                </Link>

                {/* Info */}
                <div className="flex flex-1 flex-col p-3">
                  <Link
                    href={`/store/${p.id}`}
                    className="text-sm font-bold text-white hover:text-white/80 transition"
                  >
                    {p.title}
                  </Link>
                  {p.subtitle && (
                    <div className="mt-0.5 text-xs text-white/40">
                      {p.subtitle}
                    </div>
                  )}

                  {/* Price */}
                  <div className="mt-3 flex items-center justify-between">
                    {showPoints ? (
                      <div
                        className={cn(
                          "text-base font-black",
                          canAfford ? "text-amber-400" : "text-white/40",
                        )}
                      >
                        {p.pointsCost!.toLocaleString()}{" "}
                        <span className="text-xs font-normal">RP</span>
                      </div>
                    ) : showPrice ? (
                      <div className="text-base font-black text-emerald-400">
                        ${p.priceUSD!.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-white/40">—</div>
                    )}

                    {showPoints && !canAfford && (
                      <div className="text-[10px] text-white/30">
                        {((p.pointsCost ?? 0) - points).toLocaleString()} more
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/store/${p.id}`}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-medium text-white/70 hover:bg-white/10 transition"
                    >
                      View
                    </Link>
                    {showPoints ? (
                      <button
                        disabled={isLoading || !canAfford || isPremiumLocked}
                        onClick={() => onRedeem(p)}
                        className={cn(
                          "flex-1 rounded-xl py-2 text-xs font-bold transition",
                          isLoading
                            ? "bg-white/10 text-white/40"
                            : canAfford && !isPremiumLocked
                              ? "bg-amber-500 hover:bg-amber-400 text-black"
                              : "bg-white/5 text-white/25 cursor-not-allowed",
                        )}
                      >
                        {isLoading ? "…" : "Redeem"}
                      </button>
                    ) : (
                      <button className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition">
                        Buy
                      </button>
                    )}
                  </div>

                  {/* Feedback */}
                  {(isSuccess || isError) && (
                    <div
                      className={cn(
                        "mt-2 rounded-xl border px-3 py-2 text-xs text-center",
                        isSuccess
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                          : "border-red-500/25 bg-red-500/10 text-red-300",
                      )}
                    >
                      {(redeem as any).message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Earn more CTA ──────────────────────────────────────────── */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0d1117] px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-white">
              Want more Reward Points?
            </div>
            <div className="mt-0.5 text-xs text-white/45">
              Make correct picks, claim daily login rewards and win weekly
              tournaments.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/tournaments/nba"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
            >
              NBA Picks →
            </Link>
            <Link
              href="/tournaments/mlb"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
            >
              MLB Picks →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
