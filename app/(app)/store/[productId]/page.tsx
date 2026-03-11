"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";

import { STORE_PRODUCTS } from "@/lib/store-catalog";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { cn } from "@/lib/cn";
import { auth, db } from "@/lib/firebase";

type RedeemUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

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

export default function ProductPage() {
  const router = useRouter();
  const params = useParams<{ productId: string }>();
  const { plan, points, isAuthed, loading } = useUserEntitlements();

  const product = useMemo(
    () => STORE_PRODUCTS.find((p: any) => p.id === params.productId),
    [params.productId],
  );

  const [ui, setUi] = useState<RedeemUiState>({ status: "idle" });
  const [showShippingModal, setShowShippingModal] = useState(false);

  if (!product) {
    return (
      <main className="min-h-screen text-white grid place-items-center">
        <div className="text-white/70">Product not found.</div>
      </main>
    );
  }

  const locked = product.premiumOnly && plan !== "premium";
  const canRedeem = !!product.pointsCost && points >= product.pointsCost;

  async function onRedeem() {
    const p: any = product;
    if (!p) return;

    if (locked) return router.push("/settings/subscription");

    if (!p.pointsCost) {
      setUi({ status: "error", message: "This item is buy-only." });
      setTimeout(() => setUi({ status: "idle" }), 2500);
      return;
    }

    if (!isAuthed || !auth.currentUser?.uid) {
      setUi({ status: "error", message: "Please login first." });
      setTimeout(() => setUi({ status: "idle" }), 2500);
      return;
    }

    if (!canRedeem) {
      setUi({ status: "error", message: "Not enough points." });
      setTimeout(() => setUi({ status: "idle" }), 2500);
      return;
    }

    if (p.requiresShipping === true) {
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

    setUi({ status: "loading" });

    try {
      const fn = httpsCallable(getFunctions(getApp()), "redeemProduct");
      await fn({ productId: p.id, pointsCost: p.pointsCost });

      setUi({ status: "success", message: "Redeemed ✅ (points updated)" });
    } catch (e: any) {
      setUi({ status: "error", message: errorToMessage(e) });
    } finally {
      setTimeout(() => setUi({ status: "idle" }), 2500);
    }
  }

  return (
    <>
      <ShippingRequiredModal
        open={showShippingModal}
        onClose={() => setShowShippingModal(false)}
      />

      <main className="min-h-screen text-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => router.push("/store")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:border-white/20 hover:bg-white/10"
            >
              ← Back to store
            </button>

            <div className="flex items-center gap-2">
              {isAuthed && (
                <>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                    Plan: {loading ? "..." : plan.toUpperCase()}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                    {loading ? "..." : `${points.toLocaleString()} pts`}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="relative rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="h-[340px] bg-[#05070B] from-white/10 via-white/5 to-transparent" />

              {locked && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="text-2xl">🔒</div>
                    <div className="mt-2 text-lg font-semibold">
                      Premium item
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      Upgrade to unlock this product.
                    </div>
                    <button
                      onClick={() => router.push("/settings/subscription")}
                      className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                    >
                      Upgrade
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm text-white/60">
                {String(product.category).toUpperCase()}
              </div>
              <h1 className="mt-1 text-3xl font-semibold">{product.title}</h1>
              {product.subtitle && (
                <p className="mt-2 text-white/70">{product.subtitle}</p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                {product.pointsCost ? (
                  <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2">
                    {product.pointsCost.toLocaleString()} pts
                  </span>
                ) : null}
                {product.priceUSD ? (
                  <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2">
                    ${product.priceUSD.toFixed(2)}
                  </span>
                ) : null}
                {product.premiumOnly ? (
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-blue-200">
                    Premium only
                  </span>
                ) : null}
                {(product as any).requiresShipping === true ? (
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-emerald-100">
                    Shipping required
                  </span>
                ) : null}
              </div>

              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => {
                    if (locked) return router.push("/settings/subscription");
                    alert("BUY (next step): Stripe/Checkout");
                  }}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm font-semibold",
                    locked
                      ? "bg-white/10 text-white/60"
                      : "bg-white/10 hover:bg-white/15",
                  )}
                  disabled={locked}
                >
                  Buy
                </button>

                <button
                  onClick={onRedeem}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm font-semibold",
                    locked ||
                      ui.status === "loading" ||
                      (product.pointsCost && !canRedeem)
                      ? "bg-blue-600/40 text-white/70"
                      : "bg-blue-600 hover:bg-blue-500",
                  )}
                  disabled={
                    locked ||
                    ui.status === "loading" ||
                    (product.pointsCost ? !canRedeem : true)
                  }
                >
                  {ui.status === "loading" ? "Redeeming..." : "Redeem"}
                </button>
              </div>

              {product.pointsCost && !locked && (
                <div className="mt-3 text-xs text-white/55">
                  {canRedeem
                    ? "You can redeem this item with points ✅"
                    : `You need ${(product.pointsCost - points).toLocaleString()} more points to redeem.`}
                </div>
              )}

              {(ui.status === "success" || ui.status === "error") && (
                <div
                  className={cn(
                    "mt-4 rounded-xl border px-3 py-2 text-xs",
                    ui.status === "success"
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/25 bg-red-500/10 text-red-200",
                  )}
                >
                  {ui.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
