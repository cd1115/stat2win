"use client";

import Protected from "@/components/protected";
import Link from "next/link";
import { useMemo } from "react";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

interface PremiumTournament {
  id: string;
  sport: string;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  href: string;
  status: "live" | "coming_soon" | "beta" | "open_beta";
  accentColor: string;
  accentRgb: string;
  icon: string;
  prizes?: string;
}

const PREMIUM_TOURNAMENTS: PremiumTournament[] = [
  {
    id: "mlb-props",
    sport: "MLB",
    title: "MLB Game + Player Props",
    subtitle: "Weekly",
    description:
      "Pick game lines (ML, Spread, O/U) plus the starting pitcher and star batter for every MLB game. Highest score on the weekly leaderboard wins.",
    features: [
      "Game lines — ML · Spread · Total",
      "Starting pitcher — Strikeouts / Hits Allowed",
      "Star batter — Hits / HR / RBIs",
      "Weekly leaderboard · Cash prizes",
    ],
    href: "/tournaments/mixed/mlb-props",
    status: "open_beta",
    accentColor: "#38BDF8",
    accentRgb: "56,189,248",
    icon: "⚾",
    prizes: "#1 $100 · #2 $50 · #3 $25",
  },
  {
    id: "nba-props",
    sport: "NBA",
    title: "NBA Game + Player Props",
    subtitle: "Weekly",
    description:
      "Pick game lines (ML, Spread, O/U) plus star player props like points, rebounds and assists every week. Outscore everyone on the mixed leaderboard.",
    features: [
      "Game lines — ML · Spread · Total",
      "Star player — Points / Rebounds / Assists",
      "Optional combo style scoring",
      "Weekly leaderboard · Premium prizes",
    ],
    href: "/tournaments/mixed/nba-props",
    status: "open_beta",
    accentColor: "#3B82F6",
    accentRgb: "59,130,246",
    icon: "🏀",
    prizes: "#1 $100 · #2 $50 · #3 $25",
  },
  {
    id: "multi-sport",
    sport: "MIXED",
    title: "Multi-Sport Challenge",
    subtitle: "Weekly",
    description:
      "NBA + MLB combined into one weekly leaderboard with game lines and player props. Pick across both sports and chase the top score.",
    features: [
      "NBA + MLB combined",
      "Game lines + player props",
      "Biggest prize pool",
      "Elite weekly leaderboard",
    ],
    href: "/tournaments/mixed/multi-sport",
    status: "open_beta",
    accentColor: "#A855F7",
    accentRgb: "168,85,247",
    icon: "🏆",
    prizes: "#1 $250 · #2 $100 · #3 $50",
  },
];

function StatusBadge({ status }: { status: PremiumTournament["status"] }) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live
      </span>
    );

  if (status === "open_beta")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Open Beta
      </span>
    );

  if (status === "beta")
    return (
      <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
        Beta
      </span>
    );

  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/35">
      Coming soon
    </span>
  );
}

function TournamentCard({
  t,
  isPremium,
}: {
  t: PremiumTournament;
  isPremium: boolean;
}) {
  const isActive = t.status === "live" || t.status === "open_beta";
  const isOpenBeta = t.status === "open_beta";
  const canEnter = isActive && (isOpenBeta || isPremium);

  return (
    <div
      className="group relative overflow-hidden rounded-3xl border transition-all duration-300"
      style={{
        borderColor: isActive
          ? `rgba(${t.accentRgb},0.2)`
          : "rgba(255,255,255,0.07)",
        backgroundColor: isActive
          ? `rgba(${t.accentRgb},0.04)`
          : "rgba(255,255,255,0.02)",
      }}
    >
      {isActive && (
        <div
          className="h-0.5 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${t.accentRgb},0.8), transparent)`,
          }}
        />
      )}

      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl"
              style={{
                borderColor: `rgba(${t.accentRgb},0.25)`,
                backgroundColor: `rgba(${t.accentRgb},0.1)`,
              }}
            >
              {t.icon}
            </div>

            <div>
              <div className="mb-0.5 flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">
                  {t.title}
                </span>
                <span className="text-xs font-medium text-white/30">
                  {t.subtitle}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider"
                  style={{
                    color: t.accentColor,
                    backgroundColor: `rgba(${t.accentRgb},0.12)`,
                  }}
                >
                  {t.sport}
                </span>
                <StatusBadge status={t.status} />
              </div>
            </div>
          </div>

          {t.prizes && (
            <div className="flex-shrink-0 text-right">
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/25">
                Prizes
              </div>
              <div className="text-xs font-bold text-amber-300">{t.prizes}</div>
            </div>
          )}
        </div>

        <p className="mb-4 text-sm leading-relaxed text-white/55">
          {t.description}
        </p>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {t.features.map((f) => (
            <div key={f} className="flex items-start gap-2">
              <span
                className="mt-0.5 flex-shrink-0"
                style={{ color: t.accentColor }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <circle
                    cx="6"
                    cy="6"
                    r="5.5"
                    stroke="currentColor"
                    strokeOpacity="0.4"
                  />
                  <path
                    d="M3.5 6l1.8 1.8L8.5 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-[11px] leading-tight text-white/50">
                {f}
              </span>
            </div>
          ))}
        </div>

        {canEnter ? (
          <Link
            href={t.href}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: `rgba(${t.accentRgb},0.8)` }}
          >
            {isOpenBeta ? "Enter Free →" : "Enter Tournament →"}
          </Link>
        ) : isActive && !isPremium ? (
          <Link
            href="/subscription"
            className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition hover:bg-amber-400/10"
            style={{ borderColor: "rgba(251,191,36,0.3)", color: "#FBB424" }}
          >
            ✦ Upgrade to Premium to Enter
          </Link>
        ) : (
          <div className="cursor-not-allowed flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] py-2.5 text-sm font-semibold text-white/25">
            Coming Soon
          </div>
        )}
      </div>
    </div>
  );
}

export default function TournamentsMixed() {
  const weekId = useMemo(() => getWeekId(new Date()), []);
  const weekLabel = useMemo(() => getWeekRangeLabel(new Date(), "en-US"), []);
  const { plan } = useUserEntitlements();
  const isPremium = plan === "premium";

  const active = PREMIUM_TOURNAMENTS.filter(
    (t) => t.status === "live" || t.status === "open_beta",
  );

  const upcoming = PREMIUM_TOURNAMENTS.filter(
    (t) => t.status !== "live" && t.status !== "open_beta",
  );

  return (
    <Protected>
      <div className="px-6 py-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">
                Premium Tournaments
              </span>
            </div>

            <h1 className="mb-2 text-3xl font-black tracking-tight text-white">
              Mixed Tournaments
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/50">
                {weekId}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/50">
                {weekLabel}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1 text-xs font-semibold text-emerald-300">
                Open Beta
              </span>
            </div>

            <p className="mt-3 max-w-xl text-sm text-white/40">
              Game lines + player props in one place. MLB, NBA and mixed weekly
              tournaments are now visible and open from this screen.
            </p>
          </div>

          {active.length > 0 && (
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                  Active This Week
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {active.map((t) => (
                  <TournamentCard key={t.id} t={t} isPremium={isPremium} />
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/25">
                  Coming Soon
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map((t) => (
                  <TournamentCard key={t.id} t={t} isPremium={isPremium} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/tournaments"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition hover:bg-white/8"
            >
              ← Back to Tournaments
            </Link>
          </div>
        </div>
      </div>
    </Protected>
  );
}
