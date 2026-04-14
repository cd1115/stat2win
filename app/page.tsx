"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import StorePreviewSection from "@/components/store/StorePreviewSection";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { STORE_PRODUCTS } from "@/lib/store-catalog";
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── How it works steps ────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Choose a tournament",
    desc: "New NBA and MLB games are available every day. Join the daily or weekly tournament.",
  },
  {
    step: "02",
    title: "Make your picks",
    desc: "Choose the winner (Moneyline), the spread or the Over/Under for each game before it starts.",
  },
  {
    step: "03",
    title: "Picks lock automatically",
    desc: "At the first pitch or tip-off, picks lock automatically. No changes allowed.",
  },
  {
    step: "04",
    title: "Earn points and RP",
    desc: "Correct pick = 100 tournament pts. The best players each day and week earn Reward Points (RP).",
  },
];

const MARKETS = [
  { label: "Moneyline", desc: "Who wins the game?", example: "MIA −165" },
  { label: "Spread", desc: "By how many?", example: "NYY −1.5" },
  { label: "Over/Under", desc: "How many runs/points?", example: "O 8.5" },
];

const SCORING = [
  {
    result: "Win",
    pts: "100",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    result: "Push",
    pts: "50",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    result: "Loss",
    pts: "0",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const { isAuthed, plan, points, loading } = useUserEntitlements();

  return (
    <main className="min-h-screen relative overflow-hidden text-white bg-[#05070B]">
      {/* Background — only cool blue glow, no purple */}
      <div className="pointer-events-none absolute -top-60 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute top-[60%] right-0 h-[400px] w-[400px] rounded-full bg-blue-500/8 blur-3xl" />

      {/* ── NAVBAR ── */}
      <nav className="relative border-b border-white/6 bg-[#05070B]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1">
            <span className="text-2xl font-extrabold tracking-tight text-white leading-none">
              Stat<span className="text-blue-400">2</span>Win
            </span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#how-it-works"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              How it works
            </a>
            <a
              href="#scoring"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              Scoring
            </a>
            <a
              href="#plans"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              Plans
            </a>
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-2">
            {!isAuthed ? (
              <>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 hover:border-white/18 hover:bg-white/8 hover:text-white transition"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition"
                >
                  Create account
                </Link>
              </>
            ) : (
              <Link
                href="/overview"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                Go to app →
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* ── HERO ── */}
        <section className="pt-20 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="flex flex-wrap gap-2 mb-6">
              {["No gambling", "Skill-based", "NBA & MLB", "Weekly prizes"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                  >
                    {t}
                  </span>
                ),
              )}
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08]">
              Prove you know <span className="text-blue-400">your sports.</span>
            </h1>

            <p className="mt-5 text-lg text-white/55 max-w-lg leading-relaxed">
              Make your picks de NBA y MLB, sube al leaderboard y gana premios
              reales cada semana. No gambling, sin dinero en riesgo — solo
              conocimiento deportivo.
            </p>

            {/* Quick stats */}
            <div className="mt-8 flex gap-8">
              {[
                { val: "100 pts", label: "per correct pick" },
                { val: "Daily", label: "new tournaments" },
                { val: "25 RP", label: "welcome bonus" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-xl font-bold text-white">{s.val}</div>
                  <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                Create account gratis
              </Link>
              <a
                href="#how-it-works"
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/75 hover:bg-white/8 hover:text-white transition"
              >
                How it works →
              </a>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how-it-works" className="py-16 border-t border-white/6">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
              How it works
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              From pick to prize in 4 steps
            </h2>
            <p className="mt-3 text-white/50 max-w-xl mx-auto">
              No prior experience needed. If you follow sports, you already have
              what it takes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 relative"
              >
                <div className="text-4xl font-extrabold text-white/6 absolute top-4 right-5 leading-none select-none">
                  {s.step}
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/25 flex items-center justify-center text-xs font-bold text-blue-300 mb-4">
                  {s.step}
                </div>
                <div className="text-sm font-semibold text-white mb-2">
                  {s.title}
                </div>
                <div className="text-xs text-white/48 leading-relaxed">
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── MARKETS ── */}
        <section className="py-16 border-t border-white/6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
                Pick types
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Three markets, one strategy
              </h2>
              <p className="text-white/50 leading-relaxed mb-8">
                Each game has up to 3 different pick types. Master all three or
                specialize in the one you know best.
              </p>

              <div className="space-y-3">
                {MARKETS.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                  >
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 min-w-[72px] text-center flex-shrink-0">
                      {m.example}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {m.label}
                      </div>
                      <div className="text-xs text-white/45 mt-0.5">
                        {m.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring */}
            <div id="scoring">
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
                Scoring
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Simple and transparent
              </h2>
              <p className="text-white/50 leading-relaxed mb-8">
                Tournament points determine your leaderboard position. Reward
                Points (RP) are earned by finishing in the Top 10.
              </p>

              <div className="space-y-3 mb-6">
                {SCORING.map((s) => (
                  <div
                    key={s.result}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${s.bg}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-bold ${s.color}`}>
                        {s.result}
                      </div>
                      <div className="text-xs text-white/40">Resolved pick</div>
                    </div>
                    <div className={`text-xl font-extrabold ${s.color}`}>
                      {s.pts} pts
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {/* Daily leaderboard */}
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="text-[10px] text-white/40 mb-3 uppercase tracking-widest font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                    Leaderboard Daily — Top 10
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {[
                      { label: "FREE — Pick Win", val: "+1 RP" },
                      { label: "PREMIUM — Pick Win", val: "+5 RP" },
                      { label: "FREE — Top 10 bonus", val: "+3 RP" },
                      { label: "PREMIUM — Top 10 bonus", val: "+5 RP" },
                      { label: "FREE — #1 Leaderboard", val: "+25 RP" },
                      { label: "PREMIUM — #1 Leaderboard", val: "+50 RP" },
                    ].map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-[11px] text-white/45">
                          {r.label}
                        </span>
                        <span className="text-[11px] font-bold text-amber-300 flex-shrink-0">
                          {r.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Weekly leaderboard */}
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="text-[10px] text-white/40 mb-3 uppercase tracking-widest font-semibold flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Weekly Leaderboard — Top 10
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {[
                      { label: "FREE — Pick Win", val: "+3 RP" },
                      { label: "PREMIUM — Pick Win", val: "+10 RP" },
                      { label: "FREE — Pick Push", val: "+1 RP" },
                      { label: "PREMIUM — Pick Push", val: "+3 RP" },
                      { label: "FREE — Top 10 bonus", val: "+10 RP" },
                      { label: "PREMIUM — Top 10 bonus", val: "+20 RP" },
                      { label: "FREE — #1 Winner", val: "+100 RP" },
                      { label: "PREMIUM — #1 Winner", val: "+200 RP" },
                    ].map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-[11px] text-white/45">
                          {r.label}
                        </span>
                        <span className="text-[11px] font-bold text-amber-300 flex-shrink-0">
                          {r.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF — leaderboard snapshot ── */}
        <section className="py-16 border-t border-white/6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
                Community
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Players are already competing
              </h2>
              <p className="text-white/50 leading-relaxed mb-6">
                Every week dozens of players compete to reach #1. Can you beat
                the leader?
              </p>
              <div className="flex gap-8 mb-8">
                {[
                  { val: "NBA", label: "& MLB covered" },
                  { val: "Daily", label: "new tournament" },
                  { val: "Top 10", label: "earn RP every day" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-base font-bold text-white">
                      {s.val}
                    </div>
                    <div className="text-xs text-white/38 mt-0.5">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                Join the leaderboard →
              </Link>
            </div>

            {/* Leaderboard mockup */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-white">
                  Weekly Leaderboard
                </div>
                <span className="text-[10px] text-white/35 uppercase tracking-wide">
                  This week
                </span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    rank: 1,
                    name: "carlos_pr",
                    pts: 800,
                    rp: "+29 RP",
                    medal: "🥇",
                  },
                  {
                    rank: 2,
                    name: "javi.sports",
                    pts: 700,
                    rp: "+15 RP",
                    medal: "🥈",
                  },
                  {
                    rank: 3,
                    name: "mk_picks",
                    pts: 650,
                    rp: "+10 RP",
                    medal: "🥉",
                  },
                  {
                    rank: 4,
                    name: "danielF",
                    pts: 600,
                    rp: "+5 RP",
                    medal: null,
                  },
                  {
                    rank: 5,
                    name: "you?",
                    pts: "—",
                    rp: null,
                    medal: null,
                    isYou: true,
                  },
                ].map((p) => (
                  <div
                    key={p.rank}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      p.isYou
                        ? "border-blue-400/30 bg-blue-500/10 border-dashed"
                        : "border-white/5 bg-white/[0.02]"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        p.rank === 1
                          ? "bg-amber-400/15 text-amber-300"
                          : p.rank === 2
                            ? "bg-slate-400/10 text-slate-300"
                            : p.rank === 3
                              ? "bg-orange-400/10 text-orange-300"
                              : "bg-white/5 text-white/35"
                      }`}
                    >
                      {p.medal ?? p.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${p.isYou ? "text-blue-300" : "text-white/75"}`}
                      >
                        {p.name}
                      </div>
                      {!p.isYou && (
                        <div className="mt-0.5 h-1 w-full rounded-full bg-white/8 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.rank === 1 ? "bg-amber-400" : p.rank === 2 ? "bg-slate-400" : "bg-blue-500/60"}`}
                            style={{
                              width: `${Math.round((Number(p.pts) / 800) * 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div
                        className={`text-xs font-bold ${p.isYou ? "text-blue-400/60" : "text-white/65"}`}
                      >
                        {p.pts}
                      </div>
                      {p.rp && (
                        <div className="text-[10px] text-amber-300 font-semibold">
                          {p.rp}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-blue-400/15 bg-blue-500/5 px-4 py-3 text-center">
                <div className="text-xs text-blue-200/70">
                  Create your account and appear on the leaderboard
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PLANS ── */}
        <section id="plans" className="py-16 border-t border-white/6">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
              Plans
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Start free. Scale whenever you want.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-1">
                Free
              </div>
              <div className="text-3xl font-extrabold text-white mb-1">$0</div>
              <div className="text-xs text-white/35 mb-6">Forever free</div>
              <div className="space-y-2.5 mb-6">
                {[
                  "Daily NBA & MLB tournaments",
                  "Weekly leaderboard",
                  "1 RP per win",
                  "25 RP welcome bonus",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2 text-sm text-white/65"
                  >
                    <span className="text-emerald-400 text-xs flex-shrink-0">
                      ✓
                    </span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-center text-sm font-semibold text-white/80 hover:bg-white/8 transition"
              >
                Create account gratis
              </Link>
            </div>

            {/* Premium */}
            <div className="rounded-2xl border-2 border-blue-500/40 bg-blue-600/8 p-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-[11px] font-bold text-white uppercase tracking-wide">
                Most popular
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-1">
                Premium
              </div>
              <div className="text-3xl font-extrabold text-white mb-1">
                $4.99
                <span className="text-base font-normal text-white/40">/mo</span>
              </div>
              <div className="text-xs text-white/35 mb-6">Cancel anytime</div>
              <div className="space-y-2.5 mb-6">
                {[
                  "Everything in Free",
                  "5 RP per win (5× more)",
                  "Exclusive Premium tournaments",
                  "Weekly #1 bonus: 50 RP",
                  "No ads",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2 text-sm text-white/80"
                  >
                    <span className="text-blue-400 text-xs flex-shrink-0">
                      ✓
                    </span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="block w-full rounded-xl bg-blue-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                Start Premium
              </Link>
            </div>
          </div>
        </section>

        {/* ── STORE PREVIEW ── */}
        <section className="py-16 border-t border-white/6">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
              Tienda
            </div>
            <h2 className="text-3xl font-bold text-white">
              Redeem your RP for real prizes
            </h2>
            <p className="mt-3 text-white/50 max-w-lg mx-auto">
              Gift cards, merch and more. The RP you earn in tournaments are
              used here.
            </p>
          </div>
          <StorePreviewSection
            userPlan={plan}
            userPoints={points}
            onOpenStore={() => router.push("/store-app")}
            onOpenProduct={(productId) =>
              router.push(`/store-app?product=${productId}`)
            }
            onUpgrade={() => router.push("#plans")}
            onRedeem={async (id) => {
              try {
                const p = STORE_PRODUCTS.find((x) => x.id === id);
                if (!p?.pointsCost) {
                  alert("This item is not redeemable.");
                  return;
                }
                const fn = httpsCallable(
                  getFunctions(getApp()),
                  "redeemProduct",
                );
                await fn({ productId: id, pointsCost: p.pointsCost });
                alert("Redeemed ✅");
              } catch (e: any) {
                alert(e?.message || "Redeem failed");
              }
            }}
            onBuy={(id) => router.push(`/store-app?product=${id}`)}
          />
        </section>

        {/* ── FOOTER CTA ── */}
        <section className="py-16 border-t border-white/6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ready to compete?
          </h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Create your free account, make today's picks and start climbing the
            leaderboard.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-bold text-white hover:bg-blue-500 transition"
          >
            Create account gratis
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              +25 RP
            </span>
          </Link>
          <div className="mt-4 text-xs text-white/28">
            Sin tarjeta de crédito · No gambling · 100% skill-based
          </div>
        </section>
      </div>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/6 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xl font-extrabold tracking-tight text-white">
            Stat<span className="text-blue-400">2</span>Win
          </span>
          <div className="text-xs text-white/25">
            No gambling · No odds · Skill-based · NBA & MLB
          </div>
        </div>
      </footer>
    </main>
  );
}
