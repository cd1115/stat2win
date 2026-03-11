"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  STORE_CATEGORIES,
  STORE_PRODUCTS,
  type StoreCategory,
  type StoreProduct,
} from "@/lib/store-catalog";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { cn } from "@/lib/cn";

export default function StorePublicPage() {
  const { isAuthed, plan, points, loading } = useUserEntitlements();

  const [cat, setCat] = useState<StoreCategory>("trending");

  const products = useMemo(() => {
    const list = STORE_PRODUCTS.filter((p) => p.category === cat);
    return list;
  }, [cat]);

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Background EXACTLY like Login */}
      <div className="absolute inset-0 bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[820px] rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-56 left-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/15 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-14">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-tight text-white">
              Stat<span className="text-blue-400">2</span>Win
            </div>
            <div>
              <div className="text-sm text-white/70">Store</div>
              <div className="text-xs text-white/45">
                Merch • Gift cards • Rewards
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {!isAuthed ? (
              <>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:border-white/20 hover:bg-white/10"
                >
                  Login
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                >
                  Create account
                </Link>
              </>
            ) : (
              <Link
                href="/overview"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:border-white/20 hover:bg-white/10"
              >
                Open app
              </Link>
            )}
          </div>
        </div>

        {/* Header */}
        <section className="mt-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                Store Preview
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Shop the Game
              </h1>
              <p className="mt-2 text-white/65">
                Merch, gear & rewards from the sports you love. Earn items with
                points or buy instantly.
              </p>

              <div className="mt-3 text-xs text-white/45">
                {loading
                  ? "Loading..."
                  : `Plan: ${plan.toUpperCase()} • Points: ${points.toLocaleString()}`}
              </div>
            </div>

            {!isAuthed && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75 backdrop-blur">
                <div className="font-semibold text-white">
                  Redeem requires login
                </div>
                <div className="mt-1 text-white/60">
                  Create an account to earn points and redeem rewards.
                </div>
                <Link
                  href="/login"
                  className="mt-3 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
                >
                  Login to redeem
                </Link>
              </div>
            )}
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
                      : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10",
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
            {products.map((p: StoreProduct) => {
              const isReward = !!p.pointsCost;
              const isPremium = !!p.premiumOnly;

              return (
                <div
                  key={p.id}
                  className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <div className="h-40 rounded-2xl border border-white/10 bg-black/30" />

                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{p.title}</div>
                      {isPremium && (
                        <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">
                          Premium
                        </span>
                      )}
                    </div>

                    {p.subtitle && (
                      <div className="mt-1 text-sm text-white/60">
                        {p.subtitle}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-sm">
                      {isReward ? (
                        <div className="text-blue-200">
                          {p.pointsCost!.toLocaleString()} pts
                        </div>
                      ) : (
                        <div className="text-white/70">
                          {typeof p.priceUSD === "number"
                            ? `$${p.priceUSD.toFixed(2)}`
                            : ""}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-2 text-sm text-white/85 hover:bg-white/10"
                        onClick={() => alert("Preview only (public).")}
                      >
                        View
                      </button>

                      {isReward ? (
                        <Link
                          href="/login"
                          className="flex-1 rounded-2xl bg-blue-600 py-2 text-center text-sm font-semibold hover:bg-blue-500"
                        >
                          Redeem
                        </Link>
                      ) : (
                        <button
                          className="flex-1 rounded-2xl bg-emerald-600 py-2 text-sm font-semibold hover:bg-emerald-500"
                          onClick={() => alert("Preview only (public).")}
                        >
                          Buy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
