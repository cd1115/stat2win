"use client";

import Protected from "@/components/protected";
import Link from "next/link";
import { useMemo } from "react";
import { getWeekId } from "@/lib/week";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">
      {children}
    </span>
  );
}

function LeagueChip({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
      {label}
    </div>
  );
}

export default function TournamentsMixed() {
  const weekId = useMemo(() => getWeekId(), []);

  return (
    <Protected>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Mixed Tournament</h1>
            <p className="mt-2 text-white/70">
              Semana: {weekId} • Multiple leagues combined
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge>Premium</Badge>
            <Badge>Coming soon</Badge>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">How it will work</div>
          <p className="mt-2 text-sm text-white/65">
            Mixed tournaments combine multiple leagues into one weekly
            leaderboard. You’ll pick games from NBA + NFL (and later
            MLB/Soccer).
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <LeagueChip label="NBA" />
            <LeagueChip label="NFL" />
            <LeagueChip label="MLB (soon)" />
            <LeagueChip label="SOCCER (soon)" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold">One leaderboard</div>
              <div className="mt-1 text-xs text-white/60">
                Points across multiple leagues rank you weekly.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold">Premium rewards</div>
              <div className="mt-1 text-xs text-white/60">
                Special rewards for mixed tournaments.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold">Auto lock</div>
              <div className="mt-1 text-xs text-white/60">
                Picks lock automatically before game time.
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/tournaments"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Back to tournaments
            </Link>
            <Link
              href="/settings"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
            >
              Upgrade (later)
            </Link>
          </div>
        </div>

        <p className="text-xs text-white/40">
          Nota: lo activamos cuando tengas juegos cargados de varias ligas y el
          scoring automatizado.
        </p>
      </div>
    </Protected>
  );
}
