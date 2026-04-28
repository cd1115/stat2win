"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getDayId, getDayLabel } from "@/lib/day";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

// ─── Premium Gate Overlay ──────────────────────────────────────────────────
function PremiumGate() {
  const router = useRouter();
  return (
    <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 p-5 text-center z-10"
      style={{ backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.72)" }}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-2xl">
        ✦
      </div>
      <div>
        <div className="text-sm font-bold text-amber-200 mb-1">Torneo Premium</div>
        <div className="text-xs text-white/50 leading-relaxed">
          Únete a Premium para acceder a torneos mixtos y ganar hasta 3× más RP.
        </div>
      </div>
      <button
        onClick={() => router.push("/subscription")}
        className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-sm font-bold text-black transition shadow-lg shadow-amber-500/20"
      >
        Ver Premium →
      </button>
    </div>
  );
}

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
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[10px] font-bold text-white/40">
        {league.slice(0, 3)}
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
      <img
        src={src}
        alt={league}
        className="h-5 w-5 object-contain filter brightness-0 invert opacity-70"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ─── Daily Card ────────────────────────────────────────────────────────────

function DailyCard({
  title,
  description,
  href,
  leagues,
  disabled,
  premium,
  joined,
}: {
  title: string;
  description: string;
  href: string;
  leagues: string[];
  disabled?: boolean;
  premium?: boolean;
  joined?: boolean;
}) {
  return (
    <Link
      href={disabled ? "#" : href}
      className={[
        "group relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-300",
        disabled
          ? "border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed pointer-events-none"
          : premium
            ? "border-amber-400/20 bg-[#0D1117] hover:border-amber-400/30 hover:bg-[#13181F] hover:shadow-[0_0_40px_rgba(251,191,36,0.10)]"
            : "border-white/10 bg-[#0D1117] hover:border-white/20 hover:bg-[#13181F] hover:shadow-[0_0_40px_rgba(251,191,36,0.06)]",
      ].join(" ")}
    >
      {/* Accent line top */}
      {!disabled && (
        <div
          className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${premium ? "via-amber-300/70" : "via-amber-400/50"} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
        />
      )}
      {/* Premium glow blob */}
      {premium && !disabled && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-400/8 blur-2xl" />
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {leagues.map((l) => (
            <LeagueLogo key={l} league={l} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {joined && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              ✓ Joined
            </span>
          )}
          {premium && (
            <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200">
              Premium
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${premium ? "border-amber-300/20 bg-amber-400/8 text-amber-300/70" : "border-amber-400/20 bg-amber-400/8 text-amber-300/80"}`}
          >
            Daily
          </span>
        </div>
      </div>

      <div className="flex-1">
        <h3
          className={`text-base font-semibold ${premium ? "text-amber-100" : "text-white"}`}
        >
          {title}
        </h3>
        <p className="mt-1 text-sm text-white/50">{description}</p>
      </div>

      {!disabled && (
        <div
          className={`mt-4 flex items-center gap-1.5 text-xs font-medium transition-all group-hover:gap-2 ${premium ? "text-amber-300/80 group-hover:text-amber-200" : "text-amber-400/70 group-hover:text-amber-300"}`}
        >
          {premium ? "Entrar — Premium" : "Entrar al torneo"}
          <span className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      )}
    </Link>
  );
}

// ─── Weekly Card ───────────────────────────────────────────────────────────

const WEEKLY_ACCENT: Record<
  string,
  { border: string; glow: string; badge: string; link: string; line: string }
> = {
  NBA: {
    border: "hover:border-blue-400/20",
    glow: "hover:shadow-[0_0_40px_rgba(59,130,246,0.07)]",
    badge: "border-blue-400/20 bg-blue-400/8 text-blue-300/80",
    link: "text-blue-400/70 group-hover:text-blue-300",
    line: "via-blue-400/40",
  },
  MLB: {
    border: "hover:border-sky-400/20",
    glow: "hover:shadow-[0_0_40px_rgba(56,189,248,0.07)]",
    badge: "border-sky-400/20 bg-sky-400/8 text-sky-300/80",
    link: "text-sky-400/70 group-hover:text-sky-300",
    line: "via-sky-400/40",
  },
  NFL: {
    border: "hover:border-red-400/20",
    glow: "hover:shadow-[0_0_40px_rgba(239,68,68,0.07)]",
    badge: "border-red-400/20 bg-red-400/8 text-red-300/80",
    link: "text-red-400/70 group-hover:text-red-300",
    line: "via-red-400/40",
  },
  SOCCER: {
    border: "hover:border-emerald-400/20",
    glow: "hover:shadow-[0_0_40px_rgba(52,211,153,0.07)]",
    badge: "border-emerald-400/20 bg-emerald-400/8 text-emerald-300/80",
    link: "text-emerald-400/70 group-hover:text-emerald-300",
    line: "via-emerald-400/40",
  },
  MIXED: {
    border: "hover:border-violet-400/20",
    glow: "hover:shadow-[0_0_40px_rgba(167,139,250,0.07)]",
    badge: "border-violet-400/20 bg-violet-400/8 text-violet-300/80",
    link: "text-violet-400/70 group-hover:text-violet-300",
    line: "via-violet-400/40",
  },
};

function WeeklyCard({
  title,
  description,
  href,
  leagues,
  badge,
  disabled,
  joined,
}: {
  title: string;
  description: string;
  href: string;
  leagues: string[];
  badge?: string;
  disabled?: boolean;
  joined?: boolean;
}) {
  const accentKey = leagues.length > 1 ? "MIXED" : (leagues[0] ?? "NBA");
  const accent = WEEKLY_ACCENT[accentKey] ?? WEEKLY_ACCENT.NBA;

  return (
    <Link
      href={disabled ? "#" : href}
      className={[
        "group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#0D1117] p-5 transition-all duration-300",
        disabled
          ? "opacity-40 cursor-not-allowed pointer-events-none"
          : `${accent.border} ${accent.glow} hover:bg-[#13181F]`,
      ].join(" ")}
    >
      {/* Colored accent line top */}
      {!disabled && (
        <div
          className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent ${accent.line} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
        />
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {leagues.slice(0, 3).map((l) => (
            <LeagueLogo key={l} league={l} />
          ))}
          {leagues.length > 3 && (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-[10px] text-white/40">
              +{leagues.length - 3}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {joined && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              ✓ Joined
            </span>
          )}
          {badge && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${accent.badge}`}
            >
              {badge}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-white/50">{description}</p>
      </div>

      {!disabled && (
        <div
          className={`mt-4 flex items-center gap-1.5 text-xs font-medium transition-all group-hover:gap-2 ${accent.link}`}
        >
          Ver torneo
          <span className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      )}
    </Link>
  );
}

// ─── Section divider ───────────────────────────────────────────────────────

function SectionLabel({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-white/6 pb-4">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white/30">
          {label}
        </h2>
        <p className="mt-0.5 text-sm text-white/50">{sub}</p>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

type RegState =
  | "unknown"
  | "registered"
  | "unregistered"
  | "closed"
  | "finished";

export default function TournamentsHubPage() {
  const { user } = useAuth();
  const { plan } = useUserEntitlements();
  const isPremium = plan === "premium";
  const weekId = getWeekId(new Date());
  const weekLabel = getWeekRangeLabel(new Date(), "es-PR");
  const dayId = getDayId();
  const dayLabel = getDayLabel(dayId, "es-PR");

  // nextDayId not needed — hub now uses "finished" state from server
  // getDayId() already uses PR timezone via @/lib/day

  // Registration state per tournament: key = tournamentId e.g. "2026-04-08_MLB"
  const [regStates, setRegStates] = useState<Record<string, RegState>>({});
  const [joining, setJoining] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const joinFnDaily = useMemo(
    () => httpsCallable(functions, "joinDailyTournament"),
    [],
  );
  const joinFnWeekly = useMemo(
    () => httpsCallable(functions, "joinWeeklyTournament"),
    [],
  );
  const statusFn = useMemo(
    () => httpsCallable(functions, "getTournamentStatus"),
    [],
  );

  // Check registration status for all active tournaments on load
  useEffect(() => {
    if (!user?.uid) return;
    const sports: Array<"NBA" | "MLB" | "SOCCER"> = ["NBA", "MLB", "SOCCER"];
    const types: Array<"daily" | "weekly"> = ["daily", "weekly"];
    async function checkAll() {
      const updates: Record<string, RegState> = {};
      await Promise.all(
        sports.flatMap((sport) =>
          types.map(async (type) => {
            const tournamentId =
              type === "daily" ? `${dayId}_${sport}` : `${weekId}_${sport}`;
            try {
              const res: any = await statusFn({ sport, dayId, weekId, type });
              const d = res?.data ?? {};
              if (d.isRegistered) {
                updates[tournamentId] = "registered";
              } else if (d.isOpen) {
                updates[tournamentId] = "unregistered";
              } else if (type === "daily" && d.allGamesFinished) {
                // All today's games done → show "opens tomorrow" state
                updates[tournamentId] = "finished";
              } else {
                updates[tournamentId] = "closed";
              }
            } catch {
              updates[tournamentId] = "unregistered";
            }
          }),
        ),
      );
      setRegStates(updates);
    }
    checkAll();
  }, [user?.uid, dayId, weekId]);

  async function handleJoin(
    sport: "NBA" | "MLB" | "SOCCER",
    type: "daily" | "weekly",
  ) {
    if (!user?.uid) return;
    const tournamentId =
      type === "daily" ? `${dayId}_${sport}` : `${weekId}_${sport}`;
    setJoining(tournamentId);
    try {
      if (type === "daily") {
        await joinFnDaily({ sport, dayId, weekId });
      } else {
        await joinFnWeekly({ sport, weekId });
      }
      setRegStates((prev) => ({ ...prev, [tournamentId]: "registered" }));
      setNotice(
        `✓ Joined ${sport} ${type === "daily" ? "Daily" : "Weekly"} Tournament!`,
      );
      setTimeout(() => setNotice(null), 3500);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("closed") || msg.includes("started")) {
        setRegStates((prev) => ({ ...prev, [tournamentId]: "closed" }));
        setNotice("Tournament is closed — the first game already started.");
      } else {
        setNotice(`Error: ${msg}`);
      }
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setJoining(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Tournaments
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Join a tournament before the first game starts, then make your picks.
        </p>
      </div>

      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {/* ── DAILY ── */}
      <section className="mb-12">
        <SectionLabel
          label="Torneos Diarios"
          sub={`Picks de hoy · ${dayLabel}`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["NBA", "MLB"] as const).map((sport) => {
            const tid = `${dayId}_${sport}`;
            const reg = regStates[tid] ?? "unknown";

            return (
              <div key={sport} className="relative">
                <DailyCard
                  title={`${sport} Daily`}
                  description={
                    sport === "NBA"
                      ? "Basketball picks — today's NBA games."
                      : "Baseball picks — today's MLB games."
                  }
                  href={
                    reg === "registered"
                      ? `/tournaments/daily?sport=${sport}`
                      : "#"
                  }
                  leagues={[sport]}
                />
                {reg !== "registered" && (
                  <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3 p-4 text-center">
                    {reg === "finished" ? (
                      // All games done — new tournament opens at midnight PR
                      <div>
                        <div className="text-2xl mb-2">🌙</div>
                        <div className="text-sm font-semibold text-white mb-1">
                          Today's tournament is over
                        </div>
                        <div className="text-xs text-white/45">
                          Next {sport} Daily opens at midnight PR
                        </div>
                      </div>
                    ) : reg === "closed" ? (
                      <div>
                        <div className="text-sm font-semibold text-white/70 mb-1">
                          🔒 Closed
                        </div>
                        <div className="text-xs text-white/40">
                          First game already started
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-sm font-semibold text-white mb-1">
                            {sport} Daily Tournament
                          </div>
                          <div className="text-xs text-white/50">
                            Join before the first game to make picks
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoin(sport, "daily")}
                          disabled={joining === tid}
                          className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition"
                        >
                          {joining === tid ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Joining…
                            </span>
                          ) : (
                            "Join Tournament →"
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="relative">
            <DailyCard
              title="Mixed Daily"
              description="NBA + MLB combined — Premium exclusive tournament."
              href={isPremium ? "/tournaments/daily?sport=mixed" : "#"}
              leagues={["NBA", "MLB"]}
              premium
            />
            {!isPremium && <PremiumGate />}
          </div>
        </div>

        {/* Daily leaderboard link */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/5" />
          <Link
            href="/leaderboard/daily"
            className="flex items-center gap-1.5 rounded-full border border-amber-400/15 bg-amber-400/5 px-4 py-1.5 text-xs font-medium text-amber-300/70 transition hover:border-amber-400/25 hover:text-amber-300"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Ver Daily Leaderboard →
          </Link>
          <div className="h-px flex-1 bg-white/5" />
        </div>
      </section>

      {/* ── WEEKLY ── */}
      <section>
        <SectionLabel
          label="Torneos Semanales"
          sub={`${weekId} · ${weekLabel}`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["NBA", "MLB"] as const).map((sport) => {
            const tid = `${weekId}_${sport}`;
            const reg = regStates[tid] ?? "unknown";
            const labels: Record<string, string> = {
              NBA: "Pick winners, earn points, climb the weekly board.",
              MLB: "Baseball weekly. All games of the week.",
            };
            return (
              <div key={sport} className="relative">
                <WeeklyCard
                  title={`${sport} Weekly`}
                  description={labels[sport]}
                  href={
                    reg === "registered"
                      ? `/tournaments/${sport.toLowerCase()}`
                      : "#"
                  }
                  leagues={[sport]}
                  badge="Free"
                />
                {reg !== "registered" && (
                  <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3 p-4">
                    {reg === "closed" ? (
                      <div className="text-center">
                        <div className="text-sm font-semibold text-white/70 mb-1">
                          🔒 Closed
                        </div>
                        <div className="text-xs text-white/40">
                          Registration closed for this week
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-white mb-1">
                            {sport} Weekly Tournament
                          </div>
                          <div className="text-xs text-white/50">
                            Opens Sunday · closes at first game
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoin(sport, "weekly")}
                          disabled={joining === tid}
                          className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition"
                        >
                          {joining === tid ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Joining…
                            </span>
                          ) : (
                            "Join Tournament →"
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <WeeklyCard
            title="NFL Weekly"
            description="Temporada terminada. Torneos regresan próxima temporada."
            href="#"
            leagues={["NFL"]}
            badge="Season Ended"
            disabled
          />
          {(() => {
            const tid = `${weekId}_SOCCER`;
            const reg = regStates[tid] ?? "unknown";
            return (
              <div className="relative">
                <WeeklyCard
                  title="⚽ Soccer Weekly"
                  description="EPL, La Liga, Bundesliga, Serie A, Ligue 1 & Champions League — all in one tournament."
                  href={reg === "registered" ? "/tournaments/soccer" : "#"}
                  leagues={["SOCCER"]}
                  badge="Free"
                />
                {reg !== "registered" && (
                  <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3 p-4">
                    {reg === "closed" ? (
                      <div className="text-center">
                        <div className="text-sm font-semibold text-white/70 mb-1">
                          🔒 Closed
                        </div>
                        <div className="text-xs text-white/40">
                          Registration closed for this week
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-center">
                          <div className="text-sm font-semibold text-white mb-1">
                            Soccer Weekly
                          </div>
                          <div className="text-xs text-white/50">
                            6 leagues · Opens Sunday · closes at first game
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoin("SOCCER", "weekly")}
                          disabled={joining === tid}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition"
                        >
                          {joining === tid ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Joining…
                            </span>
                          ) : (
                            "Join Tournament →"
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {reg === "registered" && (
                  <div className="absolute top-3 right-3 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"></div>
                )}
              </div>
            );
          })()}
          <div className="relative">
            <WeeklyCard
              title="Mixed Tournament"
              description="Múltiples ligas combinadas. Torneos premium."
              href={isPremium ? "/tournaments/mixed" : "#"}
              leagues={["NBA", "NFL", "MLB", "SOCCER"]}
              badge="Premium"
            />
            {!isPremium && <PremiumGate />}
          </div>
        </div>

        {/* Weekly leaderboards row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/30">Leaderboards semanales:</span>
          {[
            {
              label: "NBA",
              href: "/leaderboard/nba",
              color:
                "border-blue-400/15 bg-blue-400/5 text-blue-300/70 hover:border-blue-400/25 hover:text-blue-300",
            },
            {
              label: "MLB",
              href: "/leaderboard/mlb",
              color:
                "border-sky-400/15 bg-sky-400/5 text-sky-300/70 hover:border-sky-400/25 hover:text-sky-300",
            },
            {
              label: "Soccer",
              href: "/leaderboard/soccer",
              color:
                "border-emerald-400/15 bg-emerald-400/5 text-emerald-300/70 hover:border-emerald-400/25 hover:text-emerald-300",
            },
          ].map(({ label, href, color }) => (
            <Link
              key={label}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${color}`}
            >
              {label} →
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-12 text-[11px] text-white/20">
        Scoring: Win 100 · Loss 0 · Push 50 (push aplica a Spread / O-U cuando
        la línea exacta se cumple).
      </div>
    </div>
  );
}
