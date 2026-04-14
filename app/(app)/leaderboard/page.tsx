"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getDayId, getDayLabel } from "@/lib/day";

const BOARDS = [
  {
    id: "daily",
    title: "Daily",
    subtitle: "Leaderboard",
    description: "Rankings del día. Picks de hoy, puntos de hoy.",
    href: "/leaderboard/daily",
    tag: "Live",
    tagColor: "text-amber-300 border-amber-400/25 bg-amber-400/8",
    accent: "#F59E0B",
    accentRgb: "245,158,11",
    dot: "bg-amber-400 animate-pulse",
    lineGradient: "from-amber-400/0 via-amber-400/60 to-amber-400/0",
    numberColor: "text-amber-300",
    sports: ["NBA", "MLB"],
    isPulse: true,
  },
  {
    id: "nba-weekly",
    title: "NBA",
    subtitle: "Weekly",
    description: "Ranking semanal de baloncesto. Picks de toda la semana.",
    href: "/leaderboard/nba",
    tag: "Weekly",
    tagColor: "text-blue-300 border-blue-400/25 bg-blue-400/8",
    accent: "#3B82F6",
    accentRgb: "59,130,246",
    dot: "bg-blue-400",
    lineGradient: "from-blue-400/0 via-blue-400/60 to-blue-400/0",
    numberColor: "text-blue-300",
    sports: ["NBA"],
    isPulse: false,
  },
  {
    id: "mlb-weekly",
    title: "MLB",
    subtitle: "Weekly",
    description: "Ranking semanal de béisbol. Todos los juegos de la semana.",
    href: "/leaderboard/mlb",
    tag: "Weekly",
    tagColor: "text-sky-300 border-sky-400/25 bg-sky-400/8",
    accent: "#38BDF8",
    accentRgb: "56,189,248",
    dot: "bg-sky-400",
    lineGradient: "from-sky-400/0 via-sky-400/60 to-sky-400/0",
    numberColor: "text-sky-300",
    sports: ["MLB"],
    isPulse: false,
  },
  {
    id: "soccer-weekly",
    title: "Soccer",
    subtitle: "Weekly",
    description: "EPL, La Liga, Bundesliga, Serie A, Ligue 1 & Champions League — all in one.",
    href: "/leaderboard/soccer",
    tag: "Weekly",
    tagColor: "text-emerald-300 border-emerald-400/25 bg-emerald-400/8",
    accent: "#34D399",
    accentRgb: "52,211,153",
    dot: "bg-emerald-400",
    lineGradient: "from-emerald-400/0 via-emerald-400/60 to-emerald-400/0",
    numberColor: "text-emerald-300",
    sports: ["SOCCER"],
    isPulse: false,
  },
];

export default function LeaderboardHubPage() {
  const weekId   = useMemo(() => getWeekId(new Date()), []);
  const weekLabel= useMemo(() => getWeekRangeLabel(new Date(), "es-PR"), []);
  const dayId    = useMemo(() => getDayId(), []);
  const dayLabel = useMemo(() => getDayLabel(dayId, "es-PR"), [dayId]);

  return (
    <div className="min-h-screen px-4 md:px-8 py-8">
      <div className="mx-auto max-w-3xl">

        {/* ── Header ── */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/30" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Rankings</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">Leaderboard</h1>
          <p className="mt-2 text-sm text-white/35">Compite diario y semanal. ¿Dónde estás tú?</p>
        </div>

        {/* ── Board cards ── */}
        <div className="flex flex-col gap-3">
          {BOARDS.map((board, i) => (
            <Link
              key={board.id}
              href={board.href}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative flex overflow-hidden rounded-2xl border border-white/8 bg-[#0C0E14] transition-all duration-300 hover:border-white/15 hover:bg-[#111318]"
            >
              {/* Hover glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 rounded-2xl"
                style={{ boxShadow: `inset 0 0 60px rgba(${board.accentRgb},0.04)` }}
              />

              {/* Left accent bar */}
              <div
                className="w-1 shrink-0 rounded-l-2xl transition-all duration-300 group-hover:w-1.5"
                style={{ backgroundColor: board.accent, opacity: 0.6 }}
              />

              {/* Content */}
              <div className="flex flex-1 items-center gap-5 px-5 py-5">

                {/* Sport badges */}
                <div className="hidden sm:flex flex-col gap-1 shrink-0">
                  {board.sports.map(s => (
                    <span key={s}
                      className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                      style={{ backgroundColor: `rgba(${board.accentRgb},0.12)`, color: board.accent }}
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-lg font-black text-white tracking-tight">
                      {board.title} <span className="font-light text-white/40">{board.subtitle}</span>
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${board.tagColor} flex items-center gap-1`}>
                      {board.isPulse && <span className={`inline-flex h-1 w-1 rounded-full ${board.dot}`} />}
                      {board.tag}
                    </span>
                  </div>
                  <p className="text-sm text-white/40 truncate">{board.description}</p>
                  <p className="mt-1.5 text-[11px] text-white/20">
                    {board.id === "daily"
                      ? dayLabel
                      : `${weekId} · ${weekLabel}`}
                  </p>
                </div>

                {/* Arrow */}
                <div
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-sm text-white/30 transition-all duration-200 group-hover:border-white/15 group-hover:text-white/60 group-hover:translate-x-0.5"
                >
                  →
                </div>
              </div>

              {/* Bottom accent line */}
              <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${board.lineGradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
            </Link>
          ))}
        </div>

        {/* ── Stats footer ── */}
        <div className="mt-8 flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] px-5 py-3">
          <span className="text-[11px] text-white/25">Win 100 · Draw (Soccer) 200 · Push 50 · Loss 0</span>
          <span className="text-[11px] text-white/25">Stat2Win</span>
        </div>

      </div>
    </div>
  );
}
