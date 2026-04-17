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

// ── Limited items ─────────────────────────────────────────────────────────────
const LIMITED_ITEMS = [
  {
    id: "limited-nba-finals-cap",
    title: "NBA Finals Cap 2026",
    subtitle: "Edición limitada · Solo 50 disponibles",
    emoji: "🧢",
    rp: 2500,
    endsAt: new Date(
      Date.now() + 3 * 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000,
    ), // 3d 14h
    stock: 50,
    stockLeft: 12,
    color: "amber",
  },
  {
    id: "limited-amazon-gift-50",
    title: "Amazon Gift Card $50",
    subtitle: "Oferta especial de temporada",
    emoji: "🎁",
    rp: 5000,
    endsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000), // 1d 6h
    stock: 20,
    stockLeft: 5,
    color: "blue",
  },
  {
    id: "limited-stat2win-hoodie",
    title: "Stat2Win Hoodie",
    subtitle: "Merch exclusivo · Edición fundadores",
    emoji: "👕",
    rp: 3500,
    endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 5d 2h
    stock: 30,
    stockLeft: 18,
    color: "emerald",
  },
];

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(target: Date) {
  const calc = () => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
      expired: diff === 0,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return t;
}

// ── Limited Item Card ─────────────────────────────────────────────────────────
function LimitedCard({
  item,
  points,
  onRedeem,
}: {
  item: (typeof LIMITED_ITEMS)[0];
  points: number;
  onRedeem: (id: string, rp: number) => void;
}) {
  const t = useCountdown(item.endsAt);
  const canAfford = points >= item.rp;
  const pct = Math.round((item.stockLeft / item.stock) * 100);
  const urgent = item.stockLeft <= 8 || t.d === 0;

  const colors: Record<
    string,
    { border: string; glow: string; badge: string; btn: string }
  > = {
    amber: {
      border: "border-amber-400/30",
      glow: "bg-amber-400/6",
      badge: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      btn: "bg-amber-500 hover:bg-amber-400 text-black",
    },
    blue: {
      border: "border-blue-400/30",
      glow: "bg-blue-400/6",
      badge: "bg-blue-400/15 text-blue-300 border-blue-400/30",
      btn: "bg-blue-600 hover:bg-blue-500 text-white",
    },
    emerald: {
      border: "border-emerald-400/30",
      glow: "bg-emerald-400/6",
      badge: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      btn: "bg-emerald-600 hover:bg-emerald-500 text-white",
    },
  };
  const c = colors[item.color];

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-[#0C0E14] overflow-hidden transition hover:border-white/20",
        c.border,
      )}
    >
      {/* Ambient glow */}
      <div className={cn("absolute inset-0 pointer-events-none", c.glow)} />

      {/* LIMITED badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/15 px-2.5 py-1">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
        <span className="text-[10px] font-black text-red-300 uppercase tracking-wider">
          Limited
        </span>
      </div>

      {/* Content */}
      <div className="relative p-5 pt-10">
        {/* Emoji + title */}
        <div className="flex items-start gap-3 mb-3">
          <div className="text-4xl">{item.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white leading-tight">
              {item.title}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {item.subtitle}
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 mb-3",
            urgent
              ? "border-red-400/25 bg-red-500/8"
              : "border-white/8 bg-white/[0.03]",
          )}
        >
          <div
            className={cn(
              "text-[9px] font-bold uppercase tracking-widest mb-1.5",
              urgent ? "text-red-400/70" : "text-white/30",
            )}
          >
            {t.expired ? "Expirado" : "Termina en"}
          </div>
          <div className="flex items-center gap-2">
            {[
              { v: t.d, l: "d" },
              { v: t.h, l: "h" },
              { v: t.m, l: "m" },
              { v: t.s, l: "s" },
            ].map(({ v, l }) => (
              <div key={l} className="flex flex-col items-center">
                <div
                  className={cn(
                    "text-lg font-black tabular-nums leading-none",
                    urgent ? "text-red-300" : "text-white",
                  )}
                >
                  {String(v).padStart(2, "0")}
                </div>
                <div className="text-[8px] text-white/25 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/35">Stock disponible</span>
            <span
              className={cn(
                "text-[10px] font-bold",
                item.stockLeft <= 5 ? "text-red-400" : "text-white/50",
              )}
            >
              {item.stockLeft} de {item.stock}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct <= 25
                  ? "bg-red-400"
                  : pct <= 50
                    ? "bg-amber-400"
                    : "bg-emerald-400",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div
              className={cn(
                "text-xl font-black",
                canAfford ? "text-amber-400" : "text-white/35",
              )}
            >
              {item.rp.toLocaleString()}{" "}
              <span className="text-xs font-normal">RP</span>
            </div>
            {!canAfford && (
              <div className="text-[10px] text-white/25">
                {(item.rp - points).toLocaleString()} RP más
              </div>
            )}
          </div>
          <button
            disabled={!canAfford || t.expired}
            onClick={() => onRedeem(item.id, item.rp)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-xs font-black transition shrink-0",
              canAfford && !t.expired
                ? c.btn
                : "bg-white/5 text-white/20 cursor-not-allowed",
            )}
          >
            {t.expired ? "Expirado" : "Canjear"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080B14] px-6 py-8 mb-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-blue-500/8 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
                  Reward Store
                </span>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                Shop the Game
              </h1>
              <p className="mt-1 text-sm text-white/45">
                Canjea tus RP por premios reales o compra más RP para acelerar
                tus recompensas.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Live RP balance */}
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 px-5 py-3 text-center">
                <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-0.5">
                  Tu balance
                </div>
                <div className="text-2xl font-black text-amber-300">
                  {points.toLocaleString()}
                </div>
                <div className="text-[10px] text-amber-400/60">RP</div>
              </div>
              {!isPremium && (
                <button
                  onClick={onUpgrade}
                  className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-300 hover:bg-blue-500/20 transition text-center"
                >
                  <div>✦ Premium</div>
                  <div className="text-[10px] text-blue-400/60 font-normal mt-0.5">
                    5× más RP
                  </div>
                </button>
              )}
              {isPremium && (
                <span className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-300 text-center">
                  <div>✦ Premium</div>
                  <div className="text-[10px] text-blue-400/60 font-normal mt-0.5">
                    Activo
                  </div>
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {!loading &&
            (() => {
              const rewardProducts = STORE_PRODUCTS.filter((p) => p.pointsCost);
              const sorted = [...rewardProducts].sort(
                (a, b) => (a.pointsCost ?? 0) - (b.pointsCost ?? 0),
              );
              const maxCost = sorted[sorted.length - 1]?.pointsCost ?? 10000;
              const nextUnlock = sorted.find(
                (p) => (p.pointsCost ?? 0) > points,
              );
              return (
                <div className="relative mt-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-white/30">0 RP</span>
                    {nextUnlock && (
                      <span className="text-[10px] text-amber-400/70">
                        {(
                          (nextUnlock.pointsCost ?? 0) - points
                        ).toLocaleString()}{" "}
                        RP para{" "}
                        <span className="font-semibold">
                          {nextUnlock.title}
                        </span>
                      </span>
                    )}
                    <span className="text-[10px] text-white/30">
                      {maxCost.toLocaleString()} RP
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all"
                      style={{
                        width: `${Math.min(100, (points / maxCost) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
        </div>

        {/* ── NOT LOGGED IN ── */}
        {!isAuthed && (
          <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
            ⚠️ Por favor{" "}
            <Link href="/login" className="underline font-semibold">
              inicia sesión
            </Link>{" "}
            para canjear puntos.
          </div>
        )}

        {/* ── BUY RP SECTION ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              Comprar RP
            </span>
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-[10px] text-white/30">
              Instant · Sin suscripción
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { rp: 500, price: 1.99, bonus: null, popular: false },
              { rp: 1200, price: 3.99, bonus: "+200 bonus", popular: true },
              { rp: 2500, price: 7.99, bonus: "+500 bonus", popular: false },
              { rp: 6000, price: 14.99, bonus: "+1000 bonus", popular: false },
            ].map((pkg) => (
              <div
                key={pkg.rp}
                className={cn(
                  "relative rounded-2xl border p-4 flex flex-col gap-2 transition",
                  pkg.popular
                    ? "border-amber-400/40 bg-amber-400/8"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20",
                )}
              >
                {pkg.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-[10px] font-black text-black uppercase tracking-wide whitespace-nowrap">
                    Popular
                  </div>
                )}
                <div className="text-center">
                  <div
                    className={cn(
                      "text-2xl font-black",
                      pkg.popular ? "text-amber-300" : "text-white",
                    )}
                  >
                    {pkg.rp.toLocaleString()}
                  </div>
                  <div
                    className={cn(
                      "text-[10px] font-bold",
                      pkg.popular ? "text-amber-400/70" : "text-white/40",
                    )}
                  >
                    RP
                  </div>
                  {pkg.bonus && (
                    <div className="mt-1 text-[10px] font-bold text-emerald-400">
                      {pkg.bonus}
                    </div>
                  )}
                </div>
                <div className="mt-auto text-center">
                  <div className="text-lg font-black text-white">
                    ${pkg.price}
                  </div>
                </div>
                <button
                  className={cn(
                    "w-full rounded-xl py-2 text-xs font-bold transition",
                    pkg.popular
                      ? "bg-amber-500 hover:bg-amber-400 text-black"
                      : "bg-white/8 hover:bg-white/15 text-white",
                  )}
                >
                  Comprar
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-white/25 text-center">
            Los RP comprados se acreditan inmediatamente · No expiran
          </p>
        </div>

        {/* ── LIMITED ITEMS ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                Artículos especiales
              </span>
            </div>
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-[10px] text-white/25">
              Por tiempo limitado
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LIMITED_ITEMS.map((item) => (
              <LimitedCard
                key={item.id}
                item={item}
                points={points}
                onRedeem={(id, rp) => {
                  if (points < rp) return;
                  // TODO: connect to redeemFn with limited item logic
                  alert(`Redeeming ${id} for ${rp} RP`);
                }}
              />
            ))}
          </div>
        </div>

        {/* ── CATEGORIES ── */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Canjear RP
          </span>
          <div className="h-px flex-1 bg-white/8" />
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
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

        {/* ── Product Grid ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            const needed = showPoints ? (p.pointsCost ?? 0) - points : 0;

            return (
              <div
                key={p.id}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-2xl border bg-[#0C0E14] transition",
                  isPremiumLocked
                    ? "border-blue-500/20 opacity-75"
                    : "border-white/10 hover:border-white/18",
                )}
              >
                {/* Premium locked overlay */}
                {isPremiumLocked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
                    <div className="text-2xl mb-2">🔒</div>
                    <div className="text-xs font-bold text-blue-300 mb-1">
                      Premium Only
                    </div>
                    <button
                      onClick={onUpgrade}
                      className="mt-1 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition"
                    >
                      Upgrade
                    </button>
                  </div>
                )}

                {/* Top badges */}
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-0">
                  {(p as any).premiumOnly && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/12 px-2 py-0.5 text-[10px] font-bold text-blue-300">
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
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/35">
                      Ships
                    </span>
                  )}
                </div>

                {/* Image */}
                <Link
                  href={`/store/${p.id}`}
                  className="mx-3 mt-2 block h-36 rounded-xl border border-white/8 bg-black/40 transition hover:border-white/15 flex items-center justify-center"
                >
                  <span className="text-3xl opacity-20">🎁</span>
                </Link>

                {/* Info */}
                <div className="flex flex-1 flex-col p-3">
                  <Link
                    href={`/store/${p.id}`}
                    className="text-sm font-bold text-white hover:text-white/80 transition leading-tight"
                  >
                    {p.title}
                  </Link>
                  {p.subtitle && (
                    <div className="mt-0.5 text-xs text-white/35 leading-tight">
                      {p.subtitle}
                    </div>
                  )}

                  {/* Price + affordability */}
                  <div className="mt-3">
                    {showPoints ? (
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "text-lg font-black",
                            canAfford ? "text-amber-400" : "text-white/35",
                          )}
                        >
                          {p.pointsCost!.toLocaleString()}{" "}
                          <span className="text-xs font-normal">RP</span>
                        </div>
                        {!canAfford && needed > 0 && (
                          <div className="text-[10px] text-white/25">
                            {needed.toLocaleString()} more
                          </div>
                        )}
                        {canAfford && (
                          <div className="text-[10px] text-emerald-400 font-semibold">
                            ✓ Can redeem
                          </div>
                        )}
                      </div>
                    ) : showPrice ? (
                      <div className="text-lg font-black text-emerald-400">
                        ${p.priceUSD!.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-white/30 text-sm">—</div>
                    )}
                  </div>

                  {/* Progress bar for RP items */}
                  {showPoints && !canAfford && (
                    <div className="mt-2 h-1 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500/40"
                        style={{
                          width: `${Math.min(100, (points / (p.pointsCost ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/store/${p.id}`}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-center text-xs font-medium text-white/60 hover:bg-white/10 transition"
                    >
                      Ver
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
                              : "bg-white/5 text-white/20 cursor-not-allowed",
                        )}
                      >
                        {isLoading ? "…" : "Canjear"}
                      </button>
                    ) : (
                      <button className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition">
                        Comprar
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

        {/* ── Earn more CTA ── */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0C0E14] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
            <div>
              <div className="text-sm font-bold text-white mb-0.5">
                ¿Quieres más Reward Points?
              </div>
              <div className="text-xs text-white/40">
                Haz picks correctos, gana torneos semanales y acumula RP para
                canjear premios.
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/tournaments/nba"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
              >
                🏀 NBA
              </Link>
              <Link
                href="/tournaments/mlb"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
              >
                ⚾ MLB
              </Link>
              <Link
                href="/tournaments/soccer"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
              >
                ⚽ Soccer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
