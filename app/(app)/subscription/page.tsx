"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const REDEEM_POINTS_COST = 10000;

// ── Small helpers ─────────────────────────────────────────────────────────────
function Check({ ok = true, dim = false }: { ok?: boolean; dim?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        ok
          ? dim
            ? "bg-emerald-500/10 text-emerald-400/60"
            : "bg-emerald-500/15 text-emerald-400"
          : "bg-white/5 text-white/20",
      )}
    >
      {ok ? "✓" : "✕"}
    </span>
  );
}

function Row({
  ok = true,
  dim = false,
  children,
}: {
  ok?: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Check ok={ok} dim={dim} />
      <span
        className={cn(
          "text-sm leading-snug",
          ok
            ? dim
              ? "text-white/40"
              : "text-white/70"
            : "text-white/25 line-through",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-widest text-white/30">
      {children}
    </div>
  );
}

// ── Prize badge ───────────────────────────────────────────────────────────────
function PrizeBadge({
  place,
  amount,
  color,
}: {
  place: string;
  amount: string;
  color: "gold" | "silver" | "bronze" | "blue";
}) {
  const styles = {
    gold: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    silver: "border-slate-400/25 bg-slate-400/8 text-slate-300",
    bronze: "border-orange-400/25 bg-orange-400/8 text-orange-300",
    blue: "border-blue-400/20 bg-blue-400/8 text-blue-300",
  };
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border px-4 py-3",
        styles[color],
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {place}
      </div>
      <div className="text-lg font-extrabold mt-0.5">{amount}</div>
    </div>
  );
}

// ── Payment method icons ──────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { label: "PayPal", bg: "bg-[#003087]", text: "PP" },
  { label: "Venmo", bg: "bg-[#3D95CE]", text: "V" },
  { label: "Zelle", bg: "bg-[#6D1ED4]", text: "Z" },
  { label: "Cash App", bg: "bg-[#00D64F]", text: "C" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const router = useRouter();
  const { loading, isAuthed, plan, points } = useUserEntitlements();
  const [busy, setBusy] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const isPremium = plan === "premium";
  const canRedeemFreeMonth = points >= REDEEM_POINTS_COST;

  async function onUpgrade() {
    if (!isAuthed) {
      router.push("/login");
      return;
    }
    if (isPremium) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error: " + (data.error || "No se pudo iniciar el checkout"));
      }
    } catch (err) {
      console.error("onUpgrade error:", err);
      alert("Error al conectar con Stripe");
    } finally {
      setBusy(false);
    }
  }

  async function onManage() {
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      const customerId = snap.data()?.stripeCustomerId;
      if (!customerId) {
        alert("No se encontró tu cuenta de Stripe");
        return;
      }
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Error: " + (data.error || "No se pudo abrir el portal"));
      }
    } catch (err) {
      console.error("onManage error:", err);
      alert("Error al conectar con Stripe");
    } finally {
      setBusy(false);
    }
  }
  async function onRedeemFreeMonth() {
    if (!canRedeemFreeMonth) return;
    setRedeeming(true);
    try {
      alert(
        `Redeeming 1 free month for ${REDEEM_POINTS_COST} RP — coming soon.`,
      );
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-8">
          <button
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/8 transition"
          >
            ← Back to Settings
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              Plan: {loading ? "…" : plan.toUpperCase()}
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
              {loading ? "…" : `${points.toLocaleString()} RP`}
            </span>
          </div>
        </div>

        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold uppercase tracking-widest mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Subscription & Billing
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Choose your plan
          </h1>
          <p className="mt-2 text-white/50 max-w-xl">
            Free to play. Upgrade to Premium for real cash prizes, bigger RP
            rewards, no ads, and exclusive store items.
          </p>
        </div>

        {/* ── Prize Showcase ── */}
        <div className="mb-8 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/5 to-transparent p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">🏆</span>
            <div>
              <div className="text-sm font-bold text-amber-200">
                Real Cash Prizes — Premium Only
              </div>
              <div className="text-xs text-white/45 mt-0.5">
                Paid via PayPal, Venmo, Zelle or Cash App
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Weekly prizes */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-3">
                Weekly Tournament
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <PrizeBadge place="#1 Place" amount="$100" color="gold" />
                <PrizeBadge place="#2 Place" amount="$50" color="silver" />
                <PrizeBadge place="#3 Place" amount="$25" color="bronze" />
              </div>
              <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5 text-xs text-white/45 space-y-1">
                <div className="flex justify-between">
                  <span>Top 10 bonus</span>
                  <span className="text-amber-300 font-semibold">+20 RP</span>
                </div>
                <div className="flex justify-between">
                  <span>Per win (FREE)</span>
                  <span className="text-white/55 font-semibold">+3 RP</span>
                </div>
                <div className="flex justify-between">
                  <span>Per win (PREMIUM)</span>
                  <span className="text-amber-300 font-semibold">+10 RP</span>
                </div>
              </div>
            </div>

            {/* Daily prizes */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-3">
                Daily Tournament
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <PrizeBadge place="#1 Place" amount="$25" color="gold" />
                <PrizeBadge place="#2 Place" amount="RP" color="blue" />
                <PrizeBadge place="#3 Place" amount="RP" color="blue" />
              </div>
              <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5 text-xs text-white/45 space-y-1">
                <div className="flex justify-between">
                  <span>Top 10 bonus</span>
                  <span className="text-amber-300 font-semibold">+5 RP</span>
                </div>
                <div className="flex justify-between">
                  <span>Per win (FREE)</span>
                  <span className="text-white/55 font-semibold">+1 RP</span>
                </div>
                <div className="flex justify-between">
                  <span>Per win (PREMIUM)</span>
                  <span className="text-amber-300 font-semibold">+5 RP</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/35">
            <span>Prizes paid via:</span>
            {PAYMENT_METHODS.map((m) => (
              <span
                key={m.label}
                className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-white/55"
              >
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-black text-white flex-shrink-0",
                    m.bg,
                  )}
                >
                  {m.text}
                </span>
                {m.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Plan cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* FREE */}
          <div
            className={cn(
              "rounded-2xl border p-6 flex flex-col",
              !isPremium
                ? "border-white/15 bg-[#121418]"
                : "border-white/8 bg-white/[0.03] opacity-70",
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-lg font-bold text-white">Free</div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/50">
                $0 / mo
              </span>
            </div>
            <div className="text-xs text-white/40 mb-5">
              Forever free. No credit card needed.
            </div>

            <div className="space-y-2.5 flex-1">
              <SectionLabel>Tournaments</SectionLabel>
              <Row>Daily NBA & MLB tournaments</Row>
              <Row>Weekly NBA & MLB tournaments</Row>
              <Row>Moneyline, Spread & Over/Under</Row>
              <Row>Leaderboard access</Row>

              <SectionLabel>Scoring — Daily</SectionLabel>
              <Row>
                Pick Win →{" "}
                <span className="text-amber-300 font-semibold">+1 RP</span>
              </Row>
              <Row>
                Top 10 bonus →{" "}
                <span className="text-amber-300 font-semibold">+3 RP</span>
              </Row>
              <Row ok={false}>Daily #1 cash prize ($25)</Row>

              <SectionLabel>Scoring — Weekly</SectionLabel>
              <Row>
                Pick Win →{" "}
                <span className="text-amber-300 font-semibold">+3 RP</span>
              </Row>
              <Row>
                Top 10 bonus →{" "}
                <span className="text-amber-300 font-semibold">+10 RP</span>
              </Row>
              <Row ok={false}>Weekly cash prizes ($100 / $50 / $25)</Row>

              <SectionLabel>Other</SectionLabel>
              <Row>Redeem RP for store items</Row>
              <Row>Welcome bonus 25 RP</Row>
              <Row ok={false}>Premium store items (gift cards)</Row>
              <Row ok={false}>Ad-free experience</Row>
              <Row ok={false}>Exclusive premium tournaments</Row>
            </div>

            {!isPremium && (
              <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-center text-xs text-white/40">
                ✓ Your current plan
              </div>
            )}
          </div>

          {/* PREMIUM */}
          <div
            className={cn(
              "rounded-2xl border p-6 flex flex-col relative overflow-hidden",
              isPremium
                ? "border-emerald-500/25 bg-emerald-500/5"
                : "border-blue-500/30 bg-blue-500/5",
            )}
          >
            {/* Glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-500/15 blur-2xl" />

            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <div className="text-lg font-bold text-white flex items-center gap-2">
                  Premium
                  <span className="rounded-full border border-blue-400/30 bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300 uppercase tracking-wide">
                    Best Value
                  </span>
                </div>
                <span className="rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200">
                  $4.99 / mo
                </span>
              </div>
              <div className="text-xs text-white/40 mb-5">
                Cancel anytime. No commitments.
              </div>

              <div className="space-y-2.5 flex-1">
                <SectionLabel>Tournaments</SectionLabel>
                <Row>Everything in Free</Row>
                <Row>Exclusive premium tournaments</Row>
                <Row>Mixed tournament</Row>
                <Row>Ad-free experience</Row>

                <SectionLabel>Scoring — Daily</SectionLabel>
                <Row>
                  Pick Win →{" "}
                  <span className="text-amber-300 font-semibold">+5 RP</span>{" "}
                  <span className="text-white/30 text-xs">(5× more)</span>
                </Row>
                <Row>
                  Pick Push →{" "}
                  <span className="text-amber-300 font-semibold">+1 RP</span>
                </Row>
                <Row>
                  Top 10 bonus →{" "}
                  <span className="text-amber-300 font-semibold">+5 RP</span>
                </Row>
                <Row>
                  Daily #1 →{" "}
                  <span className="text-amber-300 font-semibold">+50 RP</span> +{" "}
                  <span className="text-emerald-300 font-semibold">
                    $25 cash 💵
                  </span>
                </Row>

                <SectionLabel>Scoring — Weekly</SectionLabel>
                <Row>
                  Pick Win →{" "}
                  <span className="text-amber-300 font-semibold">+10 RP</span>{" "}
                  <span className="text-white/30 text-xs">(3× more)</span>
                </Row>
                <Row>
                  Pick Push →{" "}
                  <span className="text-amber-300 font-semibold">+3 RP</span>
                </Row>
                <Row>
                  Top 10 bonus →{" "}
                  <span className="text-amber-300 font-semibold">+20 RP</span>
                </Row>
                <Row>
                  Weekly #1 →{" "}
                  <span className="text-amber-300 font-semibold">+200 RP</span>{" "}
                  +{" "}
                  <span className="text-emerald-300 font-semibold">
                    $100 cash 💵
                  </span>
                </Row>
                <Row>
                  Weekly #2 →{" "}
                  <span className="text-amber-300 font-semibold">+100 RP</span>{" "}
                  +{" "}
                  <span className="text-emerald-300 font-semibold">
                    $50 cash 💵
                  </span>
                </Row>
                <Row>
                  Weekly #3 →{" "}
                  <span className="text-amber-300 font-semibold">+50 RP</span> +{" "}
                  <span className="text-emerald-300 font-semibold">
                    $25 cash 💵
                  </span>
                </Row>

                <SectionLabel>Store & Rewards</SectionLabel>
                <Row>Premium gift card store items 🎁</Row>
                <Row>Redeem free months with 10,000 RP</Row>
                <Row>Priority prize payout</Row>
              </div>

              <div className="mt-5">
                {isPremium ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
                      ✓ You're on Premium
                    </div>
                    <button
                      onClick={onManage}
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-white/65 hover:bg-white/8 transition"
                    >
                      Manage subscription →
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onUpgrade}
                    disabled={busy || loading}
                    className={cn(
                      "w-full rounded-xl py-3 text-sm font-bold transition",
                      busy || loading
                        ? "bg-blue-600/40 text-white/40"
                        : "bg-blue-600 hover:bg-blue-500 text-white",
                    )}
                  >
                    {busy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Loading…
                      </span>
                    ) : (
                      "Upgrade to Premium — $4.99/mo"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Redeem free month ── */}
        <div
          className={cn(
            "mb-8 rounded-2xl border p-6",
            canRedeemFreeMonth
              ? "border-amber-400/25 bg-amber-400/5"
              : "border-white/8 bg-white/[0.02]",
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🎁</span>
                <div className="text-sm font-bold text-white">
                  Redeem a free Premium month with RP
                </div>
              </div>
              <p className="text-xs text-white/45 mb-3">
                Accumulate{" "}
                <span className="text-amber-300 font-semibold">
                  {REDEEM_POINTS_COST.toLocaleString()} RP
                </span>{" "}
                and exchange them for 1 free month of Premium — no credit card
                needed.
                {!canRedeemFreeMonth && (
                  <span className="ml-1 text-white/30">
                    You need{" "}
                    <span className="text-white/50">
                      {(REDEEM_POINTS_COST - points).toLocaleString()} more RP
                    </span>
                    .
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (points / REDEEM_POINTS_COST) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-white/45 flex-shrink-0">
                  {points.toLocaleString()} /{" "}
                  {REDEEM_POINTS_COST.toLocaleString()} RP
                </span>
              </div>
            </div>
            <button
              onClick={onRedeemFreeMonth}
              disabled={!canRedeemFreeMonth || redeeming || isPremium}
              className={cn(
                "flex-shrink-0 rounded-xl px-6 py-2.5 text-sm font-bold transition",
                canRedeemFreeMonth && !isPremium
                  ? "bg-amber-500 hover:bg-amber-400 text-black"
                  : "border border-white/8 bg-white/[0.03] text-white/25 cursor-not-allowed",
              )}
            >
              {isPremium
                ? "Already Premium"
                : redeeming
                  ? "Redeeming…"
                  : "Redeem Free Month"}
            </button>
          </div>
        </div>

        {/* ── Payment methods ── */}
        <div className="mb-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <div className="text-sm font-semibold text-white mb-1">
            Payment & Prize Payout
          </div>
          <p className="text-xs text-white/45 mb-5">
            Subscription billed securely via Stripe. Cash prizes paid out within
            48h via your preferred method.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Subscription */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
                Subscription billing
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                    <span className="text-[#635BFF] font-black text-xs">S</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Stripe
                    </div>
                    <div className="text-[10px] text-white/40">
                      Secure card processing
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Visa,
                    Mastercard, Amex
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Cancel anytime,
                    no penalty
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Receipts by
                    email
                  </div>
                </div>
                {!isPremium && (
                  <button
                    onClick={onUpgrade}
                    disabled={busy || loading}
                    className="mt-4 w-full rounded-xl bg-[#635BFF] hover:bg-[#5147e5] disabled:opacity-50 py-2 text-xs font-bold text-white transition"
                  >
                    {busy ? "Loading…" : "Subscribe — $4.99/mo"}
                  </button>
                )}
              </div>
            </div>

            {/* Prize payouts */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
                Prize payouts
              </div>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black text-white flex-shrink-0",
                        m.bg,
                      )}
                    >
                      {m.text}
                    </span>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-white/75">
                        {m.label}
                      </div>
                      <div className="text-[10px] text-white/35">
                        Cash transfer within 48h of winning
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      Available
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 text-xs text-white/35">
          💡 RP (Reward Points) are earned through correct picks, daily logins
          and tournament finishes. Redeem them in the{" "}
          <Link
            href="/store"
            className="text-blue-400/70 hover:text-blue-300 transition"
          >
            store
          </Link>{" "}
          for gift cards and products, or exchange{" "}
          {REDEEM_POINTS_COST.toLocaleString()} RP for a free Premium month.
          Cash prizes are for Premium users only and paid within 48 hours of
          tournament end.
        </div>
      </div>
    </main>
  );
}
