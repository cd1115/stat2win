"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { isNative, purchasePremium, restorePurchases } from "@/lib/purchases";

const REDEEM_POINTS_COST = 10000;

// ── Small helpers ─────────────────────────────────────────────────────────────
function Check({ ok = true, dim = false }: { ok?: boolean; dim?: boolean }) {
  return (
    <span className={cn(
      "inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
      ok ? dim ? "bg-emerald-500/10 text-emerald-400/60" : "bg-emerald-500/15 text-emerald-400"
         : "bg-white/5 text-white/20",
    )}>
      {ok ? "✓" : "✕"}
    </span>
  );
}

function Row({ ok = true, dim = false, children }: { ok?: boolean; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Check ok={ok} dim={dim} />
      <span className={cn("text-sm leading-snug",
        ok ? dim ? "text-white/40" : "text-white/70" : "text-white/25 line-through",
      )}>
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

function PrizeBadge({ place, amount, color }: { place: string; amount: string; color: "gold" | "silver" | "bronze" | "blue" }) {
  const styles = {
    gold:   "border-amber-400/30 bg-amber-400/10 text-amber-300",
    silver: "border-slate-400/25 bg-slate-400/8 text-slate-300",
    bronze: "border-orange-400/25 bg-orange-400/8 text-orange-300",
    blue:   "border-blue-400/20 bg-blue-400/8 text-blue-300",
  };
  return (
    <div className={cn("flex flex-col items-center rounded-xl border px-4 py-3", styles[color])}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{place}</div>
      <div className="text-lg font-extrabold mt-0.5">{amount}</div>
    </div>
  );
}

const PAYMENT_METHODS = [
  { label: "PayPal",   bg: "bg-[#003087]", text: "PP" },
  { label: "Venmo",    bg: "bg-[#3D95CE]", text: "V"  },
  { label: "Zelle",    bg: "bg-[#6D1ED4]", text: "Z"  },
  { label: "Cash App", bg: "bg-[#00D64F]", text: "C"  },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const router = useRouter();
  const { loading, isAuthed, plan, points } = useUserEntitlements();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isPremium = plan === "premium";
  const canRedeemFreeMonth = points >= REDEEM_POINTS_COST;
  const onNative = isNative();

  function showMsg(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function onBuyPremium() {
    if (!isAuthed) { router.push("/login"); return; }
    if (isPremium) return;

    if (!onNative) {
      showMsg("error", "La suscripción solo está disponible en la app de iOS.");
      return;
    }

    setBusy(true);
    try {
      const result = await purchasePremium();
      if (result.success) {
        showMsg("success", "¡Bienvenido a Premium! 🎉 Tu plan se activará en segundos.");
      } else if (result.error) {
        showMsg("error", result.error);
      }
    } catch (e: any) {
      showMsg("error", e?.message ?? "Error al procesar el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!onNative) {
      showMsg("error", "La restauración solo está disponible en la app de iOS.");
      return;
    }
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        showMsg("success", "✓ Suscripción Premium restaurada.");
      } else {
        showMsg("error", result.error ?? "No se encontró ninguna compra anterior.");
      }
    } finally {
      setRestoring(false);
    }
  }

  async function onRedeemFreeMonth() {
    if (!canRedeemFreeMonth) return;
    setRedeeming(true);
    try {
      showMsg("success", "Función de canje próximamente disponible.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="min-h-screen text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">

        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-8">
          <button onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/8 transition">
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

        {/* Feedback message */}
        {message && (
          <div className={cn("mb-6 rounded-2xl border px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          )}>
            {message.text}
          </div>
        )}

        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold uppercase tracking-widest mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Subscription & Billing
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Choose your plan</h1>
          <p className="mt-2 text-sm text-white/40">
            Upgrade to Premium to earn more RP, access exclusive tournaments and win cash prizes.
          </p>
        </div>

        {/* ── Plan cards ── */}
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2">

          {/* FREE */}
          <div className={cn(
            "relative flex flex-col rounded-2xl border p-6",
            !isPremium ? "border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20" : "border-white/10 bg-white/[0.02]",
          )}>
            {!isPremium && (
              <div className="absolute -top-3 left-5 rounded-full border border-blue-500/40 bg-blue-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                Current plan
              </div>
            )}
            <div className="mb-5">
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-1">Free</div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-white">$0</span>
                <span className="text-white/30 text-sm mb-1">/mes</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 flex-1">
              <SectionLabel>Torneos</SectionLabel>
              <Row>NBA Daily Tournament</Row>
              <Row>MLB Daily Tournament</Row>
              <Row>NBA Weekly Tournament</Row>
              <Row>MLB Weekly Tournament</Row>
              <Row>Soccer Weekly Tournament</Row>
              <Row ok={false}>Mixed Daily Tournament</Row>
              <Row ok={false}>Mixed Weekly Tournament</Row>

              <SectionLabel>Scoring — Daily</SectionLabel>
              <Row>Pick Win → <span className="text-amber-300 font-semibold">+1 RP</span></Row>
              <Row>Top 10 bonus → <span className="text-amber-300 font-semibold">+3 RP</span></Row>
              <Row>Daily winner #1 → <span className="text-amber-300 font-semibold">+25 RP</span></Row>

              <SectionLabel>Scoring — Weekly</SectionLabel>
              <Row>Pick Win → <span className="text-amber-300 font-semibold">+3 RP</span></Row>
              <Row>Top 10 bonus → <span className="text-amber-300 font-semibold">+10 RP</span></Row>
              <Row>Winner #1 → <span className="text-amber-300 font-semibold">+100 RP</span></Row>
            </div>
          </div>

          {/* PREMIUM */}
          <div className={cn(
            "relative flex flex-col rounded-2xl border p-6",
            isPremium
              ? "border-amber-400/40 bg-amber-400/5 ring-1 ring-amber-400/20"
              : "border-amber-400/20 bg-[#0D1117]",
          )}>
            {/* Glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-400/8 blur-3xl" />

            {isPremium && (
              <div className="absolute -top-3 left-5 rounded-full border border-amber-400/40 bg-amber-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black">
                ✦ Active
              </div>
            )}

            <div className="mb-5 relative">
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-400/70 mb-1">Premium</div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-white">$4.99</span>
                <span className="text-white/30 text-sm mb-1">/mes</span>
              </div>
              <div className="mt-1 text-[11px] text-white/35">Suscripción mensual · cancela cuando quieras</div>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 relative">
              <SectionLabel>Torneos</SectionLabel>
              <Row>NBA Daily Tournament</Row>
              <Row>MLB Daily Tournament</Row>
              <Row>NBA Weekly Tournament</Row>
              <Row>MLB Weekly Tournament</Row>
              <Row>Soccer Weekly Tournament</Row>
              <Row><span className="text-amber-300 font-semibold">Mixed Daily Tournament ✦</span></Row>
              <Row><span className="text-amber-300 font-semibold">Mixed Weekly Tournament ✦</span></Row>

              <SectionLabel>Scoring — Daily</SectionLabel>
              <Row>Pick Win → <span className="text-amber-300 font-semibold">+5 RP</span> <span className="text-white/30 text-xs">(5×)</span></Row>
              <Row>Pick Push → <span className="text-amber-300 font-semibold">+1 RP</span></Row>
              <Row>Top 10 bonus → <span className="text-amber-300 font-semibold">+25 RP</span></Row>
              <Row>Daily winner #1 → <span className="text-amber-300 font-semibold">+100 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>
              <Row>Daily winner #2 → <span className="text-amber-300 font-semibold">+50 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>
              <Row>Daily winner #3 → <span className="text-amber-300 font-semibold">+25 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>

              <SectionLabel>Scoring — Weekly</SectionLabel>
              <Row>Pick Win → <span className="text-amber-300 font-semibold">+10 RP</span> <span className="text-white/30 text-xs">(3× more)</span></Row>
              <Row>Pick Push → <span className="text-amber-300 font-semibold">+3 RP</span></Row>
              <Row>Top 10 bonus → <span className="text-amber-300 font-semibold">+50 RP</span></Row>
              <Row>Winner #1 → <span className="text-amber-300 font-semibold">+500 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>
              <Row>Winner #2 → <span className="text-amber-300 font-semibold">+200 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>
              <Row>Winner #3 → <span className="text-amber-300 font-semibold">+100 RP</span> + <span className="text-emerald-300 font-semibold">$ 💵</span></Row>

              <SectionLabel>Store & Rewards</SectionLabel>
              <Row>Premium gift card store items 🎁</Row>
              <Row>Redeem free months with 10,000 RP</Row>
              <Row>Priority prize payout</Row>
            </div>

            {/* ── CTA ── */}
            <div className="mt-6 relative flex flex-col gap-2">
              {isPremium ? (
                <>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
                    ✦ You're on Premium
                  </div>
                  <p className="text-center text-[11px] text-white/30 mt-1">
                    Para cancelar o gestionar tu suscripción ve a{" "}
                    <span className="text-white/50">Configuración → Apple ID → Suscripciones</span>{" "}
                    en tu iPhone.
                  </p>
                </>
              ) : onNative ? (
                <>
                  <button
                    onClick={onBuyPremium}
                    disabled={busy || loading}
                    className={cn(
                      "w-full rounded-xl py-3.5 text-sm font-bold transition flex items-center justify-center gap-2",
                      busy || loading
                        ? "bg-amber-500/30 text-white/40"
                        : "bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/25",
                    )}
                  >
                    {busy ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Procesando…
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                        Suscribirse — $4.99/mes
                      </>
                    )}
                  </button>
                  <p className="text-center text-[10px] text-white/25">
                    Pago seguro a través de Apple · cancela en cualquier momento
                  </p>
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs text-white/40">
                  Descarga la app de iOS para suscribirte a Premium
                </div>
              )}

              {/* Restore purchases */}
              {!isPremium && onNative && (
                <button
                  onClick={onRestore}
                  disabled={restoring}
                  className="w-full rounded-xl border border-white/8 bg-transparent py-2.5 text-xs text-white/40 hover:text-white/60 transition"
                >
                  {restoring ? "Restaurando…" : "Restaurar compra anterior"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Weekly prize pool ── */}
        <div className="mb-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <div className="text-sm font-semibold text-white mb-1">Weekly Prize Pool — Premium</div>
          <p className="text-xs text-white/45 mb-5">
            Top finishers en cada torneo semanal reciben premios en efectivo. Solo para usuarios Premium.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <PrizeBadge place="1st Place" amount="$100" color="gold" />
            <PrizeBadge place="2nd Place" amount="$50"  color="silver" />
            <PrizeBadge place="3rd Place" amount="$25"  color="bronze" />
          </div>
        </div>

        {/* ── Redeem free month ── */}
        <div className={cn(
          "mb-8 rounded-2xl border p-6",
          canRedeemFreeMonth ? "border-amber-400/25 bg-amber-400/5" : "border-white/8 bg-white/[0.02]",
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🎁</span>
                <div className="text-sm font-bold text-white">Redeem a free Premium month with RP</div>
              </div>
              <p className="text-xs text-white/45 mb-3">
                Acumula{" "}
                <span className="text-amber-300 font-semibold">{REDEEM_POINTS_COST.toLocaleString()} RP</span>{" "}
                y canjéalos por 1 mes gratis de Premium.
                {!canRedeemFreeMonth && (
                  <span className="ml-1 text-white/30">
                    Te faltan <span className="text-white/50">{(REDEEM_POINTS_COST - points).toLocaleString()} RP</span>.
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, (points / REDEEM_POINTS_COST) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white/45 flex-shrink-0">
                  {points.toLocaleString()} / {REDEEM_POINTS_COST.toLocaleString()} RP
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
              {isPremium ? "Already Premium" : redeeming ? "Canjeando…" : "Redeem Free Month"}
            </button>
          </div>
        </div>

        {/* ── Payment & Prize payouts ── */}
        <div className="mb-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6">
          <div className="text-sm font-semibold text-white mb-1">Payment & Prize Payout</div>
          <p className="text-xs text-white/45 mb-5">
            Suscripción cobrada de forma segura a través de Apple. Premios en efectivo pagados en 48h.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Apple billing */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
                Subscription billing
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Apple In-App Purchase</div>
                    <div className="text-[10px] text-white/40">Gestionado por App Store</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] text-white/40">
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Pago seguro con Apple ID</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Cancela desde Configuración → Suscripciones</div>
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Recibos automáticos por App Store</div>
                </div>
              </div>
            </div>

            {/* Prize payouts */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
                Prize payouts
              </div>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((m) => (
                  <div key={m.label} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5">
                    <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black text-white flex-shrink-0", m.bg)}>
                      {m.text}
                    </span>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-white/75">{m.label}</div>
                      <div className="text-[10px] text-white/35">Cash transfer within 48h of winning</div>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">Available</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 text-xs text-white/35">
          💡 Los RP (Reward Points) se ganan con picks correctos, logins diarios y posiciones en torneos.
          Canjéalos en la{" "}
          <Link href="/store" className="text-blue-400/70 hover:text-blue-300 transition">tienda</Link>{" "}
          por gift cards y productos, o intercambia {REDEEM_POINTS_COST.toLocaleString()} RP por un mes Premium gratis.
          Los premios en efectivo son exclusivos para Premium y se pagan en 48 horas.
        </div>
      </div>
    </main>
  );
}
