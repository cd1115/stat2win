"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";

function LeagueLogo({ league }: { league: string }) {
  const [failed, setFailed] = useState(false);

  const map: Record<string, string> = {
    NBA: "/leagues/nba.svg",
    NFL: "/leagues/nfl.png",
    MLB: "/leagues/mlb.svg",
    SOCCER: "/leagues/soccer.png",
  };

  const src = map[league];

  if (!src || failed) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1A1F29] text-xs text-white/40">
        {league}
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1A1F29]">
      <img
        src={src}
        alt={`${league} logo`}
        className="h-6 w-6 object-contain filter grayscale brightness-0 invert"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

type LeagueKey = "NBA" | "NFL" | "MLB" | "SOCCER";

const LEAGUE_UI: Record<
  LeagueKey,
  { overlay: string; ring: string; glow: string }
> = {
  NBA: {
    overlay: "from-blue-500/18 via-blue-400/8 to-transparent",
    ring: "group-hover:ring-blue-400/25",
    glow: "group-hover:shadow-[0_0_30px_rgba(59,130,246,0.18)]",
  },
  NFL: {
    overlay: "from-red-500/18 via-red-400/8 to-transparent",
    ring: "group-hover:ring-red-400/25",
    glow: "group-hover:shadow-[0_0_30px_rgba(239,68,68,0.18)]",
  },
  MLB: {
    overlay: "from-sky-500/15 via-indigo-400/8 to-transparent",
    ring: "group-hover:ring-sky-300/20",
    glow: "group-hover:shadow-[0_0_30px_rgba(56,189,248,0.16)]",
  },
  SOCCER: {
    overlay: "from-emerald-500/16 via-lime-400/8 to-transparent",
    ring: "group-hover:ring-emerald-300/20",
    glow: "group-hover:shadow-[0_0_30px_rgba(16,185,129,0.16)]",
  },
};

const MIXED_UI = {
  overlay: "from-blue-500/14 via-violet-500/10 to-fuchsia-500/10",
  ring: "group-hover:ring-violet-300/25",
  glow: "group-hover:shadow-[0_0_34px_rgba(168,85,247,0.18)]",
};

const PREMIUM_UI = {
  overlay: "from-amber-500/20 via-yellow-300/10 to-transparent",
  ring: "group-hover:ring-amber-300/30",
  glow: "group-hover:shadow-[0_0_36px_rgba(245,158,11,0.18)]",
  badge: "border-amber-300/30 bg-amber-400/10 text-amber-200",
};

const LINK_COLOR: Record<LeagueKey, string> = {
  NBA: "text-blue-400 hover:text-blue-300",
  NFL: "text-red-400 hover:text-red-300",
  MLB: "text-sky-400 hover:text-sky-300",
  SOCCER: "text-emerald-400 hover:text-emerald-300",
};

const MIXED_LINK =
  "bg-gradient-to-r from-blue-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent hover:opacity-90";

const PREMIUM_LINK = "text-amber-300 hover:text-amber-200";

function isPremium(badge?: string) {
  return (badge ?? "").toLowerCase() === "premium";
}
function isMixed(leagues: string[]) {
  return leagues.length > 1;
}
function getPrimaryLeague(leagues: string[]): LeagueKey {
  const order: LeagueKey[] = ["NBA", "NFL", "MLB", "SOCCER"];
  for (const k of order) if (leagues.includes(k)) return k;
  return (leagues[0] as LeagueKey) ?? "NBA";
}

function TournamentCard({
  title,
  description,
  href,
  leagues,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  leagues: string[];
  badge?: string;
}) {
  const premium = isPremium(badge);
  const mixed = useMemo(() => isMixed(leagues), [leagues]);

  const primaryLeague = useMemo(() => getPrimaryLeague(leagues), [leagues]);
  const leagueUI = LEAGUE_UI[primaryLeague];

  const ui = premium ? PREMIUM_UI : mixed ? MIXED_UI : leagueUI;

  const badgeClass = premium
    ? `rounded-full border px-3 py-1 text-xs font-medium ${PREMIUM_UI.badge}`
    : "text-xs px-3 py-1 rounded-full bg-[#1A1F29] text-white/80";

  const linkClass = premium
    ? PREMIUM_LINK
    : mixed
      ? MIXED_LINK
      : LINK_COLOR[primaryLeague];

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-xl border bg-[#121418] p-6 transition-all duration-300",
        premium ? "border-amber-300/20" : "border-white/10",
        "hover:bg-[#161A22]",
        "ring-1 ring-transparent",
        ui.ring,
        ui.glow,
      ].join(" ")}
    >
      <div
        className={[
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
          "bg-[#05070B]",
          ui.overlay,
          "group-hover:opacity-100",
        ].join(" ")}
      />

      {mixed && !premium && (
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-fuchsia-400/8 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}

      {premium && (
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-amber-400/8 blur-3xl" />
      )}

      <div className="relative mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {leagues.slice(0, 3).map((l) => (
            <LeagueLogo key={l} league={l} />
          ))}
          {leagues.length > 3 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1A1F29] text-xs text-white/60">
              +{leagues.length - 3}
            </div>
          )}
        </div>

        {badge && <span className={badgeClass}>{badge}</span>}
      </div>

      <h3 className="relative text-lg font-semibold text-white">{title}</h3>
      <p className="relative mt-1 text-sm text-white/60">{description}</p>

      <Link
        href={href}
        className={[
          "relative mt-4 inline-flex items-center gap-1 text-sm font-medium transition-all",
          linkClass,
          "hover:underline",
        ].join(" ")}
      >
        View tournaments →
      </Link>
    </div>
  );
}

export default function TournamentsHubPage() {
  const weekId = getWeekId(new Date());
  const weekLabel = getWeekRangeLabel(new Date(), "es-PR");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-bold text-white">Tournaments</h1>
      <p className="mt-1 text-white/60">
        Semana: {weekId} · {weekLabel} · Choose a league to enter.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <TournamentCard
          title="NBA Weekly"
          description="Pick winners, earn points, climb the weekly board."
          href="/tournaments/nba"
          leagues={["NBA"]}
          badge="Free"
        />

        <TournamentCard
          title="NFL Weekly"
          description="NFL season finished. Tournaments will return next season."
          href="#"
          leagues={["NFL"]}
          badge="Season Ended"
        />

        <TournamentCard
          title="MLB Weekly"
          description="Baseball tournaments (coming soon)."
          href="/tournaments/mlb"
          leagues={["MLB"]}
          badge="Free"
        />

        <TournamentCard
          title="Fútbol Weekly"
          description="Soccer tournaments (coming soon)."
          href="#"
          leagues={["SOCCER"]}
          badge="Soon"
        />

        <TournamentCard
          title="Mixed Tournament"
          description="Multiple leagues combined. Premium tournaments & rewards."
          href="/tournaments/mixed"
          leagues={["NBA", "NFL", "MLB", "SOCCER"]}
          badge="Premium"
        />
      </div>

      <div className="mt-10 text-xs text-white/40">
        Logos loaded from <span className="text-white/60">/public/leagues</span>{" "}
        · Supported: nba.svg, mlb.svg, nfl.png, soccer.png
      </div>
    </div>
  );
}