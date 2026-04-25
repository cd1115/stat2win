"use client";

import * as React from "react";
import {
  STORE_CATEGORIES,
  STORE_PRODUCTS,
  type StoreCategory,
  type StoreProduct,
} from "@/lib/store-catalog";

type LeagueKey = StoreCategory; // same keys
type UserPlan = "free" | "premium";

function formatMoneyUSD(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1520975958225-3f61d2730b5c?auto=format&fit=crop&w=1200&q=80";

// Tabs (igual que antes, pero usando catalog)
const LEAGUE_TABS: Array<{ key: LeagueKey; label: string }> = [
  { key: "trending", label: "🔥 Trending" },
  { key: "nba", label: "🏀 NBA" },
  { key: "nfl", label: "🏈 NFL" },
  { key: "mlb", label: "⚾ MLB" },
  { key: "nhl", label: "❄️ NHL" },
  { key: "stat2win", label: "👕 Stat2Win" },
];

const LEAGUE_STRIP: Array<{ key: Exclude<LeagueKey, "trending">; label: string }> = [
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
  { key: "mlb", label: "MLB" },
  { key: "nhl", label: "NHL" },
  { key: "stat2win", label: "Stat2Win" },
];

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [imgSrc, setImgSrc] = React.useState(src);
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    setImgSrc(src);
    setIsLoaded(false);
  }, [src]);

  return (
    <div className="relative aspect-[16/10] overflow-hidden">
      {/* Fondo premium */}
      <div className="absolute inset-0 bg-[#05070B] from-white/10 via-white/5 to-transparent" />
      <div className="absolute inset-0 opacity-60 [background:radial-gradient(ellipse_at_top,rgba(59,130,246,0.25),transparent_55%)]" />

      <img
        src={imgSrc}
        alt={alt}
        className="relative z-[1] h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setImgSrc(FALLBACK_IMAGE);
          setIsLoaded(true);
        }}
      />

      {/* Shimmer overlay (desaparece al cargar) */}
      <div
        className={cx(
          "pointer-events-none absolute inset-0 z-[2] transition-opacity duration-300",
          isLoaded ? "opacity-0" : "opacity-100"
        )}
      >
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-0 animate-pulse bg-white/5" />
        <div className="absolute -left-1/2 top-0 h-full w-1/2 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_1.2s_infinite]" />
      </div>

      {/* Overlay suave */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
    </div>
  );
}

type CTA =
  | { type: "upgrade"; label: string; hint?: string }
  | { type: "redeem"; label: string; hint?: string }
  | { type: "earn"; label: string; hint?: string }
  | { type: "buy"; label: string; hint?: string }
  | { type: "view"; label: string; hint?: string };

function getCTA(p: StoreProduct, userPlan: UserPlan, userPoints: number): CTA {
  const premiumLocked = !!p.premiumOnly && userPlan !== "premium";

  if (premiumLocked) {
    return { type: "upgrade", label: "Upgrade 🔒", hint: "Premium item" };
  }

  if (typeof p.pointsCost === "number") {
    if (userPoints >= p.pointsCost) return { type: "redeem", label: "Redeem", hint: "Use your points" };
    const need = p.pointsCost - userPoints;
    return { type: "earn", label: `Need ${need.toLocaleString()} pts`, hint: "Earn more points" };
  }

  if (typeof p.priceUSD === "number") {
    return { type: "buy", label: "Buy", hint: formatMoneyUSD(p.priceUSD) };
  }

  return { type: "view", label: "View", hint: "Details" };
}

function badgeToChip(b?: StoreProduct["badge"]) {
  if (!b) return null;
  // Mapeo a tus estilos actuales
  if (b === "Reward") return { text: "Reward", cls: "bg-blue-500/25 text-blue-100 ring-1 ring-blue-400/30" };
  if (b === "New") return { text: "New", cls: "bg-white/10 text-white ring-1 ring-white/15" };
  if (b === "Popular") return { text: "Popular", cls: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/25" };
  if (b === "Premium") return { text: "Premium", cls: "bg-purple-500/20 text-purple-100 ring-1 ring-purple-400/25" };
  return null;
}

export default function StorePreviewSection({
  onOpenStore,
  onOpenProduct,
  onUpgrade,
  onRedeem,
  onBuy,
  userPlan = "free",
  userPoints = 0,
}: {
  onOpenStore?: () => void;
  onOpenProduct?: (productId: string) => void;
  onUpgrade?: () => void;
  onRedeem?: (productId: string) => void;
  onBuy?: (productId: string) => void;
  userPlan?: UserPlan;
  userPoints?: number;
}) {
  const [activeTab, setActiveTab] = React.useState<LeagueKey>("trending");

  const filtered = React.useMemo(() => {
    // Trending: usa todo y prioriza Popular/New/Reward/Premium
    if (activeTab === "trending") {
      const rank = (p: StoreProduct) => {
        let score = 0;
        if (p.badge === "Popular") score += 4;
        if (p.badge === "New") score += 3;
        if (p.badge === "Reward") score += 2;
        if (p.badge === "Premium") score += 1;
        return score;
      };
      return [...STORE_PRODUCTS].sort((a, b) => rank(b) - rank(a)).slice(0, 8);
    }

    return STORE_PRODUCTS.filter((p) => p.category === activeTab).slice(0, 8);
  }, [activeTab]);

  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
      <style jsx global>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-40%);
          }
          100% {
            transform: translateX(140%);
          }
        }
      `}</style>

      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute right-0 top-16 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Store Preview
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Shop the Game
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-white/70 md:text-base">
            Merch, gear & rewards from the sports you love. Earn items with points or buy instantly.
          </p>

          <div className="mt-3 text-xs text-white/55">
            Your plan: <span className="text-white/80">{userPlan.toUpperCase()}</span> • Points:{" "}
            <span className="text-white/80">{userPoints.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onOpenStore?.()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10"
            type="button"
          >
            See full store
          </button>
          <button
            onClick={() => setActiveTab("stat2win")}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            type="button"
          >
            Stat2Win merch
          </button>
        </div>
      </div>

      {/* League strip */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {LEAGUE_STRIP.map((l) => (
          <button
            key={l.key}
            onClick={() => setActiveTab(l.key)}
            className={cx(
              "group relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition",
              activeTab === l.key
                ? "border-blue-400/50 bg-blue-500/15 shadow-[0_0_0_1px_rgba(96,165,250,0.25),0_0_40px_rgba(59,130,246,0.18)]"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
            type="button"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{l.label}</div>
              <span
                className={cx(
                  "text-xs transition",
                  activeTab === l.key ? "text-blue-200" : "text-white/60 group-hover:text-white/80"
                )}
              >
                Shop →
              </span>
            </div>
            <div className="mt-2 h-1 w-10 rounded-full bg-white/10">
              <div
                className={cx(
                  "h-1 rounded-full transition-all",
                  activeTab === l.key ? "w-10 bg-blue-400/80" : "w-4 bg-white/20 group-hover:w-8"
                )}
              />
            </div>
            <div className="pointer-events-none absolute -right-10 top-0 h-full w-24 rotate-12 bg-white/5 blur-xl opacity-0 transition group-hover:opacity-100" />
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {LEAGUE_TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm transition",
                isActive
                  ? "border-blue-400/40 bg-blue-500/15 text-white"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              )}
              type="button"
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((p) => {
          const cta = getCTA(p, userPlan, userPoints);
          const locked = !!p.premiumOnly && userPlan !== "premium";
          const chip = badgeToChip(p.badge);

          return (
            <article
              key={p.id}
              className={cx(
                "group overflow-hidden rounded-2xl border shadow-sm transition hover:-translate-y-1",
                locked
                  ? "border-white/10 bg-white/5 opacity-[0.92] hover:bg-white/5"
                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
              )}
            >
              {/* Top clickable area (view details) */}
              <button
                type="button"
                onClick={() => onOpenProduct?.(p.id)}
                className="relative block w-full text-left"
                aria-label={`Open product ${p.title}`}
              >
               <ProductImage src={FALLBACK_IMAGE} alt={p.title} />

                {/* Badges */}
                <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
                  {chip ? (
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur", chip.cls)}>
                      {chip.text}
                    </span>
                  ) : null}

                  {p.premiumOnly ? (
                    <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-medium text-purple-100 ring-1 ring-purple-400/25">
                      Premium {locked ? "🔒" : ""}
                    </span>
                  ) : null}
                </div>

                {/* Premium overlay */}
                {locked ? (
                  <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center">
                      <div className="text-lg">🔒</div>
                      <div className="mt-1 text-sm font-semibold text-white">Premium locked</div>
                      <div className="mt-1 text-xs text-white/70">Upgrade to unlock</div>
                    </div>
                  </div>
                ) : null}
              </button>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                    {p.subtitle ? (
                      <p className="mt-1 text-xs text-white/65">{p.subtitle}</p>
                    ) : (
                      <p className="mt-1 text-xs text-white/50">{String(p.category).toUpperCase()}</p>
                    )}
                  </div>

                  <div className="text-right">
                    {typeof p.pointsCost === "number" ? (
                      <div className="text-sm font-semibold text-blue-200">
                        {p.pointsCost.toLocaleString()} pts
                      </div>
                    ) : null}
                    {typeof p.priceUSD === "number" ? (
                      <div className="text-xs text-white/70">{formatMoneyUSD(p.priceUSD)}</div>
                    ) : (
                      <div className="text-xs text-white/55">—</div>
                    )}
                  </div>
                </div>

                {/* Hint */}
                <div className="mt-3 text-xs text-white/55">
                  {locked ? "Upgrade to unlock this item." : cta.hint ?? " "}
                </div>

                {/* CTA row */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-white/55">
                    {locked
                      ? "Premium item"
                      : typeof p.pointsCost === "number"
                      ? userPoints >= p.pointsCost
                        ? "Ready to redeem"
                        : "Earn more points"
                      : typeof p.priceUSD === "number"
                      ? "Buy instantly"
                      : "View details"}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (cta.type === "upgrade") return onUpgrade?.();
                      if (cta.type === "redeem") return onRedeem?.(p.id);
                      if (cta.type === "buy") return onBuy?.(p.id);
                      if (cta.type === "earn") return onOpenProduct?.(p.id);
                      return onOpenProduct?.(p.id);
                    }}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                      cta.type === "upgrade" && "bg-purple-600/90 text-white hover:bg-purple-500",
                      cta.type === "redeem" && "bg-blue-600/90 text-white hover:bg-blue-500",
                      cta.type === "buy" && "bg-emerald-600/85 text-white hover:bg-emerald-500",
                      (cta.type === "earn" || cta.type === "view") &&
                        "bg-white/10 text-white/90 hover:bg-white/15"
                    )}
                  >
                    {cta.label} <span aria-hidden>→</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 md:flex-row md:items-center">
        <div>
          <div className="text-sm font-semibold text-white">Want the full catalog?</div>
          <div className="mt-1 text-sm text-white/70">
            Browse by sport, rewards, and exclusive Stat2Win drops.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("trending")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10"
            type="button"
          >
            View trending
          </button>
          <button
            onClick={() => onOpenStore?.()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            type="button"
          >
            Open store
          </button>
        </div>
      </div>
    </section>
  );
}
