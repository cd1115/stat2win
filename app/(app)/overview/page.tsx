"use client";

import Link from "next/link";

export default function OverviewPage() {
  return (
    <div className="space-y-6 pb-10">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#0d1117]">
        <div className="relative px-8 py-12 md:px-14 md:py-16">
          {/* Glows */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Sports Prediction Platform
            </div>

            <h1 className="text-5xl font-black tracking-tight text-white md:text-7xl">
              Stat<span className="text-blue-400">2</span>Win
            </h1>

            <p className="mt-4 text-lg text-white/65 md:text-xl leading-relaxed">
              Pick winners. Earn points. Climb the leaderboard.
              <br />
              <span className="text-white/40 text-base">
                No betting. Pure skill.
              </span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/settings/subscription"
                className="inline-flex h-12 items-center rounded-2xl bg-blue-600 px-7 text-sm font-bold text-white transition hover:bg-blue-500 active:scale-95"
              >
                Get Premium — $4.99/mo
              </Link>
              <Link
                href="/tournaments"
                className="inline-flex h-12 items-center rounded-2xl border border-white/10 bg-white/5 px-7 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                Browse Tournaments →
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "No betting",
                "No odds",
                "Skill-based",
                "Weekly prizes",
                "NBA & MLB",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Leagues", value: "NBA, MLB, NFL, NHL" },
            { label: "Pick lock", value: "At tip-off" },
            { label: "Prizes", value: "Weekly" },
            { label: "Subscription", value: "$4.99 / mo" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-[#121418] px-5 py-4"
            >
              <div className="text-xs text-white/40 uppercase tracking-wider">
                {s.label}
              </div>
              <div className="mt-1 text-lg font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white">How it works</h2>
          <p className="mt-1 text-sm text-white/50">
            Four simple steps. Pick → Lock → Result → Points.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
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
              desc: "Select the winner — Moneyline, Spread or Over/Under — before the game starts.",
            },
            {
              step: "03",
              icon: "🔒",
              title: "Pick locks",
              desc: "At tip-off your pick locks automatically. No changes allowed after that.",
            },
            {
              step: "04",
              icon: "🏆",
              title: "Earn points",
              desc: "Correct picks earn 100 pts. Top players win weekly prizes.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121418] p-6"
            >
              <div className="absolute right-4 top-4 text-3xl font-black text-white/5">
                {s.step}
              </div>
              <div className="mb-3 text-2xl">{s.icon}</div>
              <div className="text-sm font-bold text-white">{s.title}</div>
              <div className="mt-2 text-xs text-white/55 leading-relaxed">
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING + RULES ──────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pricing card */}
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-[#0d1117] p-7 lg:col-span-1">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-300">
              ✦ Premium Plan
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-5xl font-black text-white">$4.99</span>
              <span className="mb-2 text-sm text-white/40">/ month</span>
            </div>
            <p className="mt-3 text-sm text-white/55">
              Full access to all tournaments, picks, leaderboard and weekly
              prize eligibility.
            </p>
            <div className="mt-5 space-y-2">
              {[
                "NBA & MLB tournaments",
                "Unlimited picks per week",
                "Moneyline, Spread & O/U",
                "Weekly leaderboard prizes",
                "2x reward points per win",
                "Priority support",
              ].map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 text-sm text-white/70"
                >
                  <span className="text-blue-400">✓</span> {f}
                </div>
              ))}
            </div>
            <Link
              href="/settings/subscription"
              className="mt-6 flex h-11 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              Subscribe Now
            </Link>
          </div>
        </div>

        {/* Rules + scoring */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-white/10 bg-[#121418] p-6">
            <h3 className="text-base font-bold text-white">Scoring System</h3>
            <p className="mt-1 text-xs text-white/50">
              Points update automatically when games go FINAL.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                {
                  result: "Win ✅",
                  pts: "100 pts",
                  color: "text-emerald-300",
                  border: "border-emerald-500/20 bg-emerald-500/5",
                },
                {
                  result: "Push 🔁",
                  pts: "50 pts",
                  color: "text-yellow-300",
                  border: "border-yellow-500/20 bg-yellow-500/5",
                },
                {
                  result: "Loss ❌",
                  pts: "0 pts",
                  color: "text-red-300",
                  border: "border-red-500/20 bg-red-500/5",
                },
              ].map((s) => (
                <div
                  key={s.result}
                  className={`rounded-2xl border ${s.border} p-4 text-center`}
                >
                  <div className="text-xs text-white/50">{s.result}</div>
                  <div className={`mt-1 text-xl font-black ${s.color}`}>
                    {s.pts}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121418] p-6">
            <h3 className="text-base font-bold text-white">Quick Rules</h3>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { icon: "🔒", rule: "Picks lock at game start" },
                { icon: "📅", rule: "Leaderboard resets weekly" },
                { icon: "🏅", rule: "Top 10 earn reward points" },
                { icon: "👑", rule: "#1 earns the weekly prize" },
                { icon: "📊", rule: "Spread & O/U also available" },
                { icon: "🚫", rule: "No betting — skill only" },
              ].map((r) => (
                <div
                  key={r.rule}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0F1115] px-4 py-3"
                >
                  <span className="text-base">{r.icon}</span>
                  <span className="text-xs text-white/65">{r.rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BOTTOM ───────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121418] px-8 py-10 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-indigo-500/5" />
          <div className="relative">
            <h2 className="text-2xl font-black text-white md:text-3xl">
              Ready to compete?
            </h2>
            <p className="mt-2 text-white/50">
              Join Stat2Win and prove your sports knowledge every week.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
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
          </div>
        </div>
      </section>
    </div>
  );
}
