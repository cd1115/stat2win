"use client";

import { useCallback, useMemo, useState } from "react";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
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
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-[92%] max-w-md rounded-3xl border border-white/10 bg-[#0b1020]/95 p-6 backdrop-blur-xl">
        <div className="text-xl font-semibold text-white">
          Shipping address required
        </div>
        <p className="mt-2 text-sm text-white/70">
          To redeem physical rewards, please add your shipping address first.
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/60">
          Go to <span className="text-white/80">Settings</span>, save your
          address, then come back to redeem.
        </div>

        <div className="mt-6 flex gap-2">
          <Link
            href="/settings"
            className="flex-1 rounded-xl bg-blue-600 py-2 text-center text-sm font-semibold text-white hover:bg-blue-500"
          >
            Go to Settings
          </Link>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-sm text-white hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StoreAppPage() {
  const router = useRouter();
  const { isAuthed, plan, points, loading } = useUserEntitlements();

  const [cat, setCat] = useState<StoreCategory>("trending");
  const [redeem, setRedeem] = useState<RedeemState>({ status: "idle" });
  const [showShippingModal, setShowShippingModal] = useState(false);

  // ✅ Keep products stable
  const products = useMemo(() => {
    if (cat === "trending") return STORE_PRODUCTS;
    return STORE_PRODUCTS.filter((p) => p.category === cat);
  }, [cat]);

  // ✅ Create callable once (avoid re-creating each redeem)
  const redeemFn = useMemo(() => {
    return httpsCallable(getFunctions(getApp()), "redeemProduct");
  }, []);

  const onUpgrade = useCallback(() => {
    router.push("/settings/subscription");
  }, [router]);

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

      // ✅ Optional: quick client guard (no break)
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
        const uid = auth.currentUser.uid;
        const snap = await getDoc(doc(db, "users", uid));
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
        await redeemFn({ productId: product.id, pointsCost: product.pointsCost });

        setRedeem({
          status: "success",
          productId: product.id,
          message: "Redeemed ✅ (points updated)",
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
    [points, redeemFn]
  );

  return (
    <>
      <ShippingRequiredModal
        open={showShippingModal}
        onClose={() => setShowShippingModal(false)}
      />

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-sm text-white/60">Store</div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Shop the Game
            </h1>
            <p className="mt-2 text-white/70">
              Redeem with points or buy instantly. Your rewards, in one place.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                Plan: {loading ? "..." : plan.toUpperCase()}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                Points: {loading ? "..." : points.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <button
              onClick={onUpgrade}
              className="rounded-xl bg-blue-600/90 px-4 py-2 text-sm font-semibold transition hover:bg-blue-600"
            >
              Upgrade
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="mt-8 flex flex-wrap gap-2">
          {STORE_CATEGORIES.map((c) => {
            const active = c.key === cat;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition",
                  active
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-100"
                    : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
                )}
              >
                {c.emoji ? `${c.emoji} ` : ""}
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => {
            const isLoading =
              redeem.status === "loading" && redeem.productId === p.id;
            const isSuccess =
              redeem.status === "success" && redeem.productId === p.id;
            const isError =
              redeem.status === "error" && redeem.productId === p.id;

            const showPoints = typeof p.pointsCost === "number";
            const showPrice = typeof p.priceUSD === "number";

            return (
              <div
                key={p.id}
                className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {p.premiumOnly && (
                      <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-100">
                        Premium
                      </span>
                    )}
                    {showPoints ? (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[11px] text-blue-100">
                        Reward
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                        Buy
                      </span>
                    )}
                    {(p as any).requiresShipping === true && (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100">
                        Shipping
                      </span>
                    )}
                  </div>
                </div>

                {/* ✅ Imagen clickeable */}
                <Link
                  href={`/store/${p.id}`}
                  className="mt-3 block h-40 rounded-2xl border border-white/10 bg-black/30 transition hover:border-white/20 hover:bg-black/25"
                  aria-label={`View ${p.title}`}
                />

                <div className="mt-4">
                  {/* ✅ Título clickeable */}
                  <Link
                    href={`/store/${p.id}`}
                    className="font-semibold text-white hover:text-white/90 hover:underline underline-offset-4"
                  >
                    {p.title}
                  </Link>

                  {p.subtitle && (
                    <div className="mt-1 text-sm text-white/65">
                      {p.subtitle}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-sm">
                    {showPoints ? (
                      <div className="text-blue-200">
                        {p.pointsCost!.toLocaleString()} pts
                      </div>
                    ) : showPrice ? (
                      <div className="text-white/70">
                        ${p.priceUSD!.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-white/60">—</div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/store/${p.id}`}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2 text-center text-sm text-white/85 transition hover:bg-white/10"
                    >
                      View
                    </Link>

                    {showPoints ? (
                      <button
                        disabled={isLoading}
                        onClick={() => onRedeem(p)}
                        className={cn(
                          "flex-1 rounded-2xl py-2 text-sm font-semibold transition",
                          isLoading
                            ? "bg-white/10 text-white/60"
                            : "bg-blue-600/90 text-white hover:bg-blue-600"
                        )}
                      >
                        {isLoading ? "Redeeming..." : "Redeem"}
                      </button>
                    ) : (
                      <button className="flex-1 rounded-2xl bg-emerald-600/80 py-2 text-sm font-semibold transition hover:bg-emerald-600">
                        Buy
                      </button>
                    )}
                  </div>

                  {(isSuccess || isError) && (
                    <div
                      className={cn(
                        "mt-3 rounded-xl border px-3 py-2 text-xs",
                        isSuccess
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                          : "border-red-500/25 bg-red-500/10 text-red-200"
                      )}
                    >
                      {redeem.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!isAuthed && (
          <div className="mt-10 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            You’re not logged in. Please sign in to redeem points.
          </div>
        )}
      </div>
    </>
  );
}