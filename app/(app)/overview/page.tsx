"use client";

import Link from "next/link";

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "🏀",
    title: "Choose a game",
    desc: "Browse today's NBA or MLB matchups in the Tournaments section.",
  },
  {
    step: "02",
    icon: "🎯",
    title: "Make your pick",
    desc: "Select Moneyline, Spread or Over/Under before the game starts.",
  },
  {
    step: "03",
    icon: "🔒",
    title: "Pick locks",
    desc: "At tip-off your pick locks automatically. No changes allowed.",
  },
  {
    step: "04",
    icon: "🏆",
    title: "Earn points",
    desc: "Correct picks earn 100 pts. Top players earn RP every day and week.",
  },
];

const MARKETS = [
  {
    label: "Moneyline",
    short: "ML",
    desc: "Pick who wins the game.",
    example: "LAC wins",
    color: "text-blue-300",
    bg: "bg-blue-500/10 border-blue-400/20",
  },
  {
    label: "Spread",
    short: "SP",
    desc: "Pick who covers the point spread.",
    example: "GSW +5.5",
    color: "text-violet-300",
    bg: "bg-violet-500/10 border-violet-400/20",
  },
  {
    label: "Over/Under",
    short: "O/U",
    desc: "Will the total go over or under?",
    example: "O 220.5",
    color: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-400/20",
  },
];

const SCORING = [
  {
    result: "Win ✅",
    pts: "100",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    result: "Push 🔁",
    pts: "50",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  {
    result: "Loss ❌",
    pts: "0",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
];

const RULES = [
  { icon: "🔒", rule: "Picks lock at game start (tip-off / first pitch)" },
  { icon: "📅", rule: "Weekly leaderboard resets every Monday" },
  { icon: "☀️", rule: "Daily leaderboard resets every day" },
  { icon: "🏅", rule: "Top 10 players earn Reward Points (RP) daily & weekly" },
  { icon: "👑", rule: "#1 on the weekly leaderboard earns the top prize" },
  {
    icon: "🔀",
    rule: "You can pick Spread OR Moneyline — not both on the same game",
  },
  {
    icon: "🤝",
    rule: "Tiebreaker: 1st Points · 2nd Win Rate (wins ÷ total picks) · 3rd Most picks played",
  },
  { icon: "📊", rule: "O/U can be combined with Spread or Moneyline" },
  { icon: "🚫", rule: "No betting, no real money at risk — 100% skill-based" },
  { icon: "⏱️", rule: "Rankings update automatically when games go FINAL" },
  { icon: "🎁", rule: "New accounts receive +25 RP welcome bonus" },
];

const DAILY_RP = [
  { label: "FREE — Pick Win", val: "+1 RP" },
  { label: "PREMIUM — Pick Win", val: "+5 RP" },
  { label: "FREE — Top 10 bonus", val: "+3 RP" },
  { label: "PREMIUM — Top 10 bonus", val: "+5 RP" },
  { label: "FREE — #1 Leaderboard", val: "+25 RP" },
  { label: "PREMIUM — #1 Leaderboard", val: "+50 RP" },
];

const WEEKLY_RP = [
  { label: "FREE — Pick Win", val: "+3 RP" },
  { label: "PREMIUM — Pick Win", val: "+10 RP" },
  { label: "FREE — Pick Push", val: "+1 RP" },
  { label: "PREMIUM — Pick Push", val: "+3 RP" },
  { label: "FREE — Top 10 bonus", val: "+10 RP" },
  { label: "PREMIUM — Top 10 bonus", val: "+20 RP" },
  { label: "FREE — #1 Winner", val: "+100 RP" },
  { label: "PREMIUM — #1 Winner", val: "+200 RP" },
];

export default function OverviewPage() {
  return (
    <div className="space-y-5 pb-12">
      {/* ── HERO ── */}
      <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#0d1117]">
        <div className="relative px-6 py-10 md:px-12 md:py-14">
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Sports Prediction Platform
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">
              Stat<span className="text-blue-400">2</span>Win
            </h1>
            <p className="mt-3 text-base text-white/60 md:text-lg leading-relaxed">
              Make your picks de NBA y MLB, sube al leaderboard y gana premios
              reales cada semana.{" "}
              <span className="text-white/35">
                No gambling — solo conocimiento deportivo.
              </span>
            </p>
            <div className="mt-6 flex gap-8">
              {[
                { val: "100 pts", label: "per correct pick" },
                { val: "Daily", label: "new tournaments" },
                { val: "25 RP", label: "welcome bonus" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-lg font-bold text-white">{s.val}</div>
                  <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/tournaments/nba"
                className="inline-flex h-11 items-center rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                Start Picking →
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm text-white/80 transition hover:bg-white/10"
              >
                View Leaderboard
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["No gambling", "Skill-based", "NBA & MLB", "Weekly prizes"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50"
                  >
                    {t}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            How it works
          </div>
          <h2 className="text-xl font-bold text-white">
            From pick to prize in 4 steps
          </h2>
          <p className="mt-1 text-sm text-white/45">
            No prior experience needed. If you follow sports, you already have
            what it takes.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.step}
              className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#121418] p-4"
            >
              <div className="absolute right-3 top-3 text-3xl font-black text-white/5 select-none">
                {s.step}
              </div>
              <div className="mb-2 text-xl">{s.icon}</div>
              <div className="text-xs font-bold text-white mb-1">{s.title}</div>
              <div className="text-[11px] text-white/45 leading-relaxed">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MARKETS + SCORING ── */}
      <section className="mx-auto w-full max-w-6xl grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Markets */}
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            Pick types
          </div>
          <h3 className="text-base font-bold text-white mb-3">
            Three markets, one strategy
          </h3>
          <div className="space-y-2">
            {MARKETS.map((m) => (
              <div
                key={m.label}
                className={`flex items-center gap-3 rounded-xl border ${m.bg} px-3 py-3`}
              >
                <span
                  className={`shrink-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-xs font-black ${m.color} min-w-[36px] text-center`}
                >
                  {m.short}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {m.label}
                  </div>
                  <div className="text-[11px] text-white/45 mt-0.5">
                    {m.desc}
                  </div>
                </div>
                <span className="ml-auto text-[11px] font-bold text-white/30 shrink-0">
                  {m.example}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring */}
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            Scoring
          </div>
          <h3 className="text-base font-bold text-white mb-3">
            Simple and transparent
          </h3>
          <div className="space-y-2 mb-4">
            {SCORING.map((s) => (
              <div
                key={s.result}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${s.bg}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`text-sm font-bold ${s.color}`}>
                    {s.result}
                  </div>
                  <div className="text-xs text-white/35">Resolved pick</div>
                </div>
                <div className={`text-xl font-black ${s.color}`}>
                  {s.pts} pts
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Push applies to Spread and O/U when the result lands exactly on the
            line. Rankings update when games go{" "}
            <span className="text-white/60">FINAL</span>.
          </p>
        </div>
      </section>

      {/* ── RULES ── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">
            Rules
          </div>
          <h3 className="text-base font-bold text-white mb-4">Game rules</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {RULES.map((r) => (
              <div
                key={r.rule}
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-3"
              >
                <span className="text-base shrink-0 mt-0.5">{r.icon}</span>
                <span className="text-xs text-white/60 leading-relaxed">
                  {r.rule}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIEBREAKER ── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">⚖️</span>
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              Tiebreaker Rules
            </div>
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            ¿Qué pasa si dos jugadores empatan?
          </h3>
          <p className="text-xs text-white/45 mb-5 leading-relaxed">
            Si dos o más jugadores terminan con los mismos puntos, se aplica
            este sistema de desempate en orden de prioridad:
          </p>

          <div className="space-y-3">
            {/* Step 1 */}
            <div className="flex items-start gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/25">
                <span className="text-sm font-black text-amber-300">1</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white mb-0.5">
                  Puntos totales
                </div>
                <div className="text-xs text-white/50 leading-relaxed">
                  El jugador con más puntos gana. Win = 100 pts · Push = 50 pts
                  · Loss = 0 pts.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4 rounded-xl border border-blue-400/20 bg-blue-500/5 px-4 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-400/15 border border-blue-400/25">
                <span className="text-sm font-black text-blue-300">2</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white mb-0.5">
                  Win Rate — si hay empate en puntos
                </div>
                <div className="text-xs text-white/50 leading-relaxed mb-2">
                  Se calcula como{" "}
                  <span className="text-white/80 font-semibold">
                    Wins ÷ (Wins + Losses + Pushes)
                  </span>
                  . El jugador con mayor porcentaje de victorias gana.
                </div>
                {/* Example */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Jugador A", w: 8, l: 2, p: 0, pts: 800 },
                    { name: "Jugador B", w: 7, l: 1, p: 2, pts: 800 },
                  ].map((p) => {
                    const wr = Math.round((p.w / (p.w + p.l + p.p)) * 100);
                    return (
                      <div
                        key={p.name}
                        className="rounded-lg border border-white/8 bg-black/20 px-3 py-2"
                      >
                        <div className="text-[11px] font-bold text-white/70 mb-1">
                          {p.name}
                        </div>
                        <div className="text-xs text-white/40">
                          {p.w}W · {p.l}L · {p.p}P
                        </div>
                        <div className="text-xs text-white/40">{p.pts} pts</div>
                        <div className="text-sm font-black text-blue-300 mt-1">
                          {wr}% win rate
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-white/35 mt-2">
                  → Jugador B gana el desempate con 80% vs 80%... en este caso
                  igual. El sistema evaluaría el paso 3.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 border border-emerald-400/25">
                <span className="text-sm font-black text-emerald-300">3</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white mb-0.5">
                  Total de picks jugados — si aún hay empate
                </div>
                <div className="text-xs text-white/50 leading-relaxed">
                  El jugador que haya hecho más picks en total (Wins + Losses +
                  Pushes) gana. Más actividad = ventaja en el desempate final.
                </div>
              </div>
            </div>

            {/* Shared prize */}
            <div className="flex items-start gap-4 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8 border border-white/10">
                <span className="text-sm">🤝</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white mb-0.5">
                  Empate total — premio compartido
                </div>
                <div className="text-xs text-white/50 leading-relaxed">
                  Si dos jugadores empatan en los{" "}
                  <span className="text-white/70 font-semibold">
                    3 criterios
                  </span>{" "}
                  (puntos + win rate + total picks), ambos comparten el premio
                  del 1er lugar y reciben los mismos RP.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── RP SYSTEM ── */}
      <section className="mx-auto w-full max-w-6xl grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Daily RP */}
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Daily Leaderboard — Top 10
            </div>
          </div>
          <div className="space-y-2">
            {DAILY_RP.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-xs text-white/50">{r.label}</span>
                <span className="text-xs font-black text-amber-300 shrink-0">
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly RP */}
        <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Weekly Leaderboard — Top 10
            </div>
          </div>
          <div className="space-y-2">
            {WEEKLY_RP.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-xs text-white/50">{r.label}</span>
                <span className="text-xs font-black text-amber-300 shrink-0">
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBSCRIPTION CTA ── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/40 bg-blue-600/8 p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="absolute -top-9 left-4 rounded-full bg-blue-600 px-4 py-1 text-[11px] font-bold text-white uppercase tracking-wide">
                ✦ Premium Plan
              </div>
              <div className="mt-2 flex items-end gap-1 mb-2">
                <span className="text-4xl font-black text-white">$4.99</span>
                <span className="mb-1.5 text-sm text-white/40">/ month</span>
              </div>
              <p className="text-sm text-white/50 max-w-sm">
                Acceso completo a todos los torneos, picks ilimitados,
                leaderboard y elegibilidad para premios semanales.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                {[
                  "NBA & MLB tournaments",
                  "5 RP por win (5× más)",
                  "Picks ilimitados",
                  "Weekly #1 bonus: 50 RP",
                  "Moneyline, Spread & O/U",
                  "Priority support",
                ].map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2 text-xs text-white/65"
                  >
                    <span className="text-blue-400 shrink-0">✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <Link
                href="/settings/subscription"
                className="flex h-12 items-center justify-center rounded-2xl bg-blue-600 px-8 text-sm font-bold text-white transition hover:bg-blue-500 whitespace-nowrap"
              >
                Subscribe Now — $4.99/mo
              </Link>
              <Link
                href="/tournaments/nba"
                className="flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 text-sm text-white/70 transition hover:bg-white/10 whitespace-nowrap"
              >
                Try free first →
              </Link>
              <p className="text-[11px] text-white/25 text-center">
                Cancel anytime · No gambling
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121418] px-6 py-10 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-indigo-500/5" />
          <div className="relative">
            <h2 className="text-2xl font-black text-white md:text-3xl">
              Ready to compete?
            </h2>
            <p className="mt-2 text-white/45 text-sm">
              Pick today's games and start climbing the leaderboard.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tournaments/nba"
                className="inline-flex h-11 items-center rounded-2xl bg-blue-600 px-7 text-sm font-bold text-white transition hover:bg-blue-500"
              >
                Start Picking →
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-7 text-sm text-white/75 transition hover:bg-white/10"
              >
                View Leaderboard
              </Link>
            </div>
            <div className="mt-4 text-xs text-white/25">
              Sin tarjeta de crédito · No gambling · 100% skill-based
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
