"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

function Feature({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 rounded-full border grid place-items-center text-xs",
          ok
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-white/55",
        )}
      >
        {ok ? "✓" : "•"}
      </div>
      <div className="text-sm text-white/75">{children}</div>
    </div>
  );
}

export default function SubscriptionPage() {
  const router = useRouter();
  const { loading, isAuthed, plan, points } = useUserEntitlements();
  const [busy, setBusy] = useState(false);

  const isPremium = plan === "premium";

  const benefits = useMemo(
    () => ({
      free: [
        "Join weekly tournaments (Free tiers).",
        "Earn points from correct picks.",
        "Access to Store and My Redeems.",
      ],
      premium: [
        "Unlock premium tournaments & bigger prize pools.",
        "Bonus points multipliers (future-ready).",
        "Priority support & early feature access.",
        "Premium-only rewards in the Store.",
        "No ads (future-ready).",
      ],
    }),
    [],
  );

  async function onUpgrade() {
    if (!isAuthed) {
      router.push("/login");
      return;
    }
    if (isPremium) return;

    setBusy(true);
    try {
      // ✅ Próximo paso: aquí conectamos Stripe Checkout (cloud function)
      // Por ahora lo dejamos como placeholder.
      alert("Stripe checkout is the next step. We’ll connect it here.");
    } finally {
      setBusy(false);
    }
  }

  async function onManage() {
    // ✅ Próximo paso: Customer Portal (Stripe)
    alert("Stripe Customer Portal is the next step. We’ll connect it here.");
  }

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top row */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:border-white/20 hover:bg-white/10"
          >
            ← Back to Settings
          </button>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
              Plan: {loading ? "..." : plan.toUpperCase()}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
              {loading ? "..." : `${points.toLocaleString()} pts`}
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="mt-6">
          <div className="inline-flex items-center gap-2 text-sm text-white/60">
            <span className="h-2 w-2 rounded-full bg-blue-500/70" />
            Billing
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Subscription
          </h1>
          <p className="mt-2 max-w-2xl text-white/65">
            Upgrade to Premium to unlock more tournaments, exclusive rewards,
            and future pro features.
          </p>
        </div>

        {/* Content */}
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {/* Current plan card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl lg:col-span-1">
            <div className="text-sm text-white/60">Current plan</div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="text-2xl font-semibold">
                {loading ? "…" : isPremium ? "Premium" : "Free"}
              </div>

              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  isPremium
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 bg-white/5 text-white/70",
                )}
              >
                {isPremium ? "Active" : "Standard"}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/60">Your points</div>
              <div className="mt-1 text-xl font-semibold">
                {loading ? "…" : points.toLocaleString()}
                <span className="ml-2 text-sm font-normal text-white/60">
                  pts
                </span>
              </div>
              <div className="mt-2 text-xs text-white/55">
                Earn points by making correct picks and redeem in the Store.
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              {!isPremium ? (
                <button
                  onClick={onUpgrade}
                  disabled={busy || loading}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-sm font-semibold transition",
                    busy || loading
                      ? "bg-blue-600/40 text-white/70"
                      : "bg-blue-600 hover:bg-blue-500 text-white",
                  )}
                >
                  {busy ? "Starting..." : "Upgrade to Premium"}
                </button>
              ) : (
                <button
                  onClick={onManage}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
                >
                  Manage subscription
                </button>
              )}

              <Link
                href="/store"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
              >
                Store
              </Link>
            </div>

            <div className="mt-4 text-xs text-white/50">
              Next step: connect Stripe Checkout & Customer Portal.
            </div>
          </div>

          {/* Plan comparison */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl lg:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm text-white/60">Compare plans</div>
                <div className="mt-1 text-xl font-semibold">
                  Free vs Premium
                </div>
                <div className="mt-1 text-sm text-white/65">
                  Premium is built for users who want bigger tournaments and
                  better rewards.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                  Price: <span className="text-white/85">$9.99/mo</span>{" "}
                  (placeholder)
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {/* Free */}
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">Free</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    $0
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {benefits.free.map((t) => (
                    <Feature key={t} ok>
                      {t}
                    </Feature>
                  ))}
                  <Feature ok={false}>
                    Premium tournaments & exclusive rewards
                  </Feature>
                  <Feature ok={false}>No ads (future-ready)</Feature>
                </div>
              </div>

              {/* Premium */}
              <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">Premium</div>
                  <span className="rounded-full border border-blue-500/25 bg-blue-500/15 px-3 py-1 text-xs text-blue-100">
                    Recommended
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {benefits.premium.map((t) => (
                    <Feature key={t} ok>
                      {t}
                    </Feature>
                  ))}
                  <Feature ok>Everything in Free included</Feature>
                </div>

                {!isPremium && (
                  <button
                    onClick={onUpgrade}
                    disabled={busy || loading}
                    className={cn(
                      "mt-5 w-full rounded-2xl py-3 text-sm font-semibold transition",
                      busy || loading
                        ? "bg-blue-600/40 text-white/70"
                        : "bg-blue-600 hover:bg-blue-500 text-white",
                    )}
                  >
                    {busy ? "Starting..." : "Upgrade now"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/60">
              Tip: later we’ll hook this up to Stripe Checkout (upgrade) +
              Stripe Customer Portal (manage/cancel).
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
