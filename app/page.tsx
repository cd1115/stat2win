"use client";

import Link from "next/link";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "🏀",
    title: "Choose a game",
    desc: "NBA, MLB y Soccer disponibles cada día. Elige tu pick antes del inicio.",
  },
  {
    step: "02",
    icon: "🎯",
    title: "Make your picks",
    desc: "Moneyline, Spread o Over/Under. Hasta 3 picks por partido.",
  },
  {
    step: "03",
    icon: "🔒",
    title: "Picks lock automatically",
    desc: "Al tip-off o primer pitch se bloquean. No se permiten cambios.",
  },
  {
    step: "04",
    icon: "🏆",
    title: "Earn points & RP",
    desc: "Win = 100 pts. Top 10 ganan Reward Points cada día y semana.",
  },
];

const MARKETS = [
  {
    short: "ML",
    label: "Moneyline",
    desc: "¿Quién gana el partido?",
    example: "LAC wins",
    color: "text-blue-300",
    bg: "bg-blue-500/10 border-blue-400/20",
  },
  {
    short: "SP",
    label: "Spread",
    desc: "¿Por cuánto gana o pierde?",
    example: "GSW +5.5",
    color: "text-violet-300",
    bg: "bg-violet-500/10 border-violet-400/20",
  },
  {
    short: "O/U",
    label: "Over/Under",
    desc: "¿Cuántos puntos/carreras en total?",
    example: "O 220.5",
    color: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-400/20",
  },
];

const SCORING = [
  {
    result: "Win ✅",
    label: "Win",
    pts: "100",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    result: "Push 🔁",
    label: "Push",
    pts: "50",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    result: "Loss ❌",
    label: "Loss",
    pts: "0",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
];

const FREE_FEATURES = [
  "NBA, MLB & Soccer tournaments",
  "Daily + weekly leaderboard",
  "Picks diarios compartidos por el equipo",
  "1 RP per win · 25 RP welcome bonus",
  "Top 10 earn RP every week",
];

const PREMIUM_FEATURES = [
  "Todo lo de Free incluido",
  "5 RP por win — 5× más que Free",
  "Picks diarios con análisis exclusivo Premium",
  "Weekly #1 bonus: 200 RP",
  "Top 10 weekly bonus: 20 RP",
  "Acceso a torneos Premium exclusivos",
  "Priority support",
];

export default function HomePage() {
  const { isAuthed } = useUserEntitlements();

  return (
    <main className="min-h-screen relative overflow-hidden text-white bg-[#05070B]">
      {/* Glows */}
      <div className="pointer-events-none absolute -top-60 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute top-[60%] right-0 h-[400px] w-[400px] rounded-full bg-blue-500/8 blur-3xl" />

      {/* ── NAVBAR ── */}
      <nav className="relative border-b border-white/6 bg-[#05070B]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1">
            <span className="text-2xl font-extrabold tracking-tight text-white leading-none">
              Stat<span className="text-blue-400">2</span>Win
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#how-it-works"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              How it works
            </a>
            <a
              href="#daily-picks"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              Daily picks
            </a>
            <a
              href="#plans"
              className="text-sm text-white/55 hover:text-white/90 transition"
            >
              Plans
            </a>
          </div>
          <div className="flex items-center gap-2">
            {!isAuthed ? (
              <>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 hover:bg-white/8 hover:text-white transition"
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
              {[
                "No gambling",
                "Skill-based",
                "NBA · MLB · Soccer",
                "Weekly prizes",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65"
                >
                  {t}
                </span>
              ))}
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08]">
              Prove you know <span className="text-blue-400">your sports.</span>
            </h1>
            <p className="mt-5 text-lg text-white/55 max-w-lg leading-relaxed">
              Haz tus picks de NBA, MLB y Soccer, sube al leaderboard y gana
              premios reales cada semana. Sin dinero en riesgo — solo
              conocimiento deportivo.
            </p>
            <div className="mt-8 flex gap-8">
              {[
                { val: "100 pts", label: "per correct pick" },
                { val: "Daily", label: "picks & tournaments" },
                { val: "+25 RP", label: "welcome bonus" },
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
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${(p as any).isYou ? "border-blue-400/30 bg-blue-500/10 border-dashed" : "border-white/5 bg-white/[0.02]"}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${p.rank === 1 ? "bg-amber-400/15 text-amber-300" : p.rank === 2 ? "bg-slate-400/10 text-slate-300" : p.rank === 3 ? "bg-orange-400/10 text-orange-300" : "bg-white/5 text-white/35"}`}
                  >
                    {p.medal ?? p.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-medium truncate ${(p as any).isYou ? "text-blue-300" : "text-white/75"}`}
                    >
                      {p.name}
                    </div>
                    {!(p as any).isYou && (
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
                      className={`text-xs font-bold ${(p as any).isYou ? "text-blue-400/60" : "text-white/65"}`}
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
                <div className="text-4xl font-extrabold text-white/5 absolute top-4 right-5 leading-none select-none">
                  {s.step}
                </div>
                <div className="text-2xl mb-3">{s.icon}</div>
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/25 flex items-center justify-center text-xs font-bold text-blue-300 mb-3">
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

        {/* ── DAILY PICKS ── */}
        <section id="daily-picks" className="py-16 border-t border-white/6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
                Daily picks
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Compartimos picks diarios para ayudarte a ganar
              </h2>
              <p className="text-white/50 leading-relaxed mb-6">
                Cada día nuestro equipo comparte picks analizados para NBA, MLB
                y Soccer. Úsalos como referencia, combínalos con tu propio
                análisis y sube al leaderboard.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  {
                    icon: "📊",
                    title: "Análisis diario",
                    desc: "Picks seleccionados cada mañana antes de los juegos del día.",
                  },
                  {
                    icon: "🎯",
                    title: "NBA, MLB & Soccer",
                    desc: "Cubrimos los 3 deportes con picks de Moneyline, Spread y O/U.",
                  },
                  {
                    icon: "⭐",
                    title: "Premium: análisis exclusivo",
                    desc: "Los usuarios Premium reciben picks con análisis detallado y contexto adicional.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
                  >
                    <span className="text-lg mt-0.5 flex-shrink-0">
                      {item.icon}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {item.title}
                      </div>
                      <div className="text-xs text-white/45 mt-0.5">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition"
              >
                Ver picks de hoy →
              </Link>
            </div>

            {/* Daily picks mockup */}
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                      Pick del día — NBA
                    </span>
                  </div>
                  <span className="text-[10px] text-white/30">Hoy</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">
                      BOS vs MIA
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Moneyline · 7:30 PM
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-2 text-center">
                    <div className="text-sm font-black text-blue-300">BOS</div>
                    <div className="text-[10px] text-blue-400/60">ML</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                      Pick del día — MLB
                    </span>
                  </div>
                  <span className="text-[10px] text-white/30">Hoy</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">
                      NYY vs BOS
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Over/Under · 1:05 PM
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center">
                    <div className="text-sm font-black text-amber-300">
                      O 8.5
                    </div>
                    <div className="text-[10px] text-amber-400/60">O/U</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
                      Pick del día — Soccer
                    </span>
                  </div>
                  <span className="text-[10px] text-white/30">Hoy</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white">
                      BAY vs REA
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Moneyline · 3:00 PM
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-center">
                    <div className="text-sm font-black text-emerald-300">
                      BAY
                    </div>
                    <div className="text-[10px] text-emerald-400/60">ML</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── MARKETS + SCORING ── */}
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
                Cada partido tiene hasta 3 tipos de pick. Domina los 3 o
                especialízate en el que mejor conozcas.
              </p>
              <div className="space-y-3">
                {MARKETS.map((m) => (
                  <div
                    key={m.label}
                    className={`flex items-center gap-4 rounded-xl border ${m.bg} px-4 py-3`}
                  >
                    <div
                      className={`rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-black ${m.color} min-w-[44px] text-center flex-shrink-0`}
                    >
                      {m.short}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {m.label}
                      </div>
                      <div className="text-xs text-white/45 mt-0.5">
                        {m.desc}
                      </div>
                    </div>
                    <span className="ml-auto text-xs text-white/25 flex-shrink-0">
                      {m.example}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div id="scoring">
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
                Scoring
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Simple and transparent
              </h2>
              <p className="text-white/50 leading-relaxed mb-6">
                Los puntos del torneo determinan tu posición en el leaderboard.
                Los Reward Points (RP) se ganan en el Top 10.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {SCORING.map((s) => (
                  <div
                    key={s.result}
                    className={`rounded-xl border ${s.bg} p-4 flex flex-col items-center justify-center text-center gap-1`}
                  >
                    <div className={`text-2xl font-extrabold ${s.color}`}>
                      {s.pts}
                    </div>
                    <div className={`text-xs font-semibold ${s.color}`}>
                      pts
                    </div>
                    <div className="text-[10px] text-white/40 mt-1">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-xs text-white/35 leading-relaxed">
                Push aplica cuando el resultado cae exactamente en la línea del
                Spread u O/U. Los rankings se actualizan automáticamente cuando
                los juegos van <span className="text-white/60">FINAL</span>.
              </div>
            </div>
          </div>
        </section>

        {/* ── PLANS ── */}
        <section id="plans" className="py-16 border-t border-white/6">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
              Plans
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Empieza gratis. Escala cuando quieras.
            </h2>
            <p className="mt-3 text-white/45 max-w-lg mx-auto">
              La experiencia básica es completamente gratuita. Premium
              multiplica tus recompensas y te da ventajas exclusivas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 flex flex-col">
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                Free
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">$0</div>
              <div className="text-xs text-white/35 mb-6">
                Para siempre gratis · Sin tarjeta
              </div>
              <div className="space-y-2.5 mb-8 flex-1">
                {FREE_FEATURES.map((f) => (
                  <div
                    key={f}
                    className="flex items-start gap-2 text-sm text-white/65"
                  >
                    <span className="text-emerald-400 text-xs flex-shrink-0 mt-0.5">
                      ✓
                    </span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 text-center text-sm font-semibold text-white/80 hover:bg-white/8 transition"
              >
                Create account gratis +25 RP
              </Link>
            </div>

            {/* Premium */}
            <div className="rounded-2xl border-2 border-blue-500/40 bg-blue-600/8 p-7 relative flex flex-col">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-5 py-1 text-[11px] font-bold text-white uppercase tracking-wide whitespace-nowrap">
                ✦ Most popular
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">
                Premium
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">
                $4.99
                <span className="text-base font-normal text-white/40">/mo</span>
              </div>
              <div className="text-xs text-white/35 mb-6">
                Cancel anytime · Sin compromisos
              </div>

              {/* Value highlight */}
              <div className="rounded-xl bg-blue-500/10 border border-blue-400/20 px-4 py-3 mb-5">
                <div className="text-xs font-bold text-blue-300 mb-1">
                  ¿Por qué Premium vale la pena?
                </div>
                <div className="text-xs text-white/50 leading-relaxed">
                  Ganas{" "}
                  <span className="text-blue-300 font-semibold">
                    5× más RP por win
                  </span>
                  , acceso a picks con análisis exclusivo cada día, y bonos más
                  altos al terminar Top 10 o #1 en el leaderboard.
                </div>
              </div>

              <div className="space-y-2.5 mb-8 flex-1">
                {PREMIUM_FEATURES.map((f) => (
                  <div
                    key={f}
                    className="flex items-start gap-2 text-sm text-white/80"
                  >
                    <span className="text-blue-400 text-xs flex-shrink-0 mt-0.5">
                      ✓
                    </span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                href="/signup"
                className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-bold text-white hover:bg-blue-500 transition"
              >
                Start Premium — $4.99/mo
              </Link>
              <div className="mt-2 text-center text-[11px] text-white/25">
                Cancela cuando quieras
              </div>
            </div>
          </div>

          {/* Plan comparison note */}
          <div className="mt-8 max-w-3xl mx-auto rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">
              Comparación rápida — RP por semana
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Pick win (weekly)",
                  free: "+3 RP",
                  premium: "+10 RP",
                },
                { label: "Top 10 bonus", free: "+10 RP", premium: "+20 RP" },
                { label: "#1 winner", free: "+100 RP", premium: "+200 RP" },
                { label: "Daily pick win", free: "+1 RP", premium: "+5 RP" },
              ].map((r) => (
                <div
                  key={r.label}
                  className="rounded-xl border border-white/8 bg-black/20 p-3"
                >
                  <div className="text-[10px] text-white/40 mb-2">
                    {r.label}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">Free</span>
                    <span className="text-xs font-bold text-white/60">
                      {r.free}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-blue-400">Premium</span>
                    <span className="text-xs font-black text-blue-300">
                      {r.premium}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER CTA ── */}
        <section className="py-16 border-t border-white/6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Ready to compete?
          </h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            Crea tu cuenta gratis, recibe los picks de hoy y empieza a subir el
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
            Sin tarjeta · No gambling · 100% skill-based
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
            No gambling · No odds · Skill-based · NBA · MLB · Soccer
          </div>
        </div>
      </footer>
    </main>
  );
}
