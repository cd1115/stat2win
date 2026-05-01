"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getDayId, getDayLabel } from "@/lib/day";
import { useAuth } from "@/lib/auth-context";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Plan = "free" | "premium";

type RpSnapshot = {
  wins: number;
  pushes: number;
  rp: number;
  byNba: number;
  byMlb: number;
  bySoccer: number;
};

// ---------------------------------------------------------------------------
// RP rate helpers
// ---------------------------------------------------------------------------
function weeklyRpRate(plan: Plan) {
  return plan === "premium"
    ? { win: 10, push: 3 }
    : { win: 3,  push: 1 };
}

function dailyRpRate(plan: Plan) {
  return plan === "premium"
    ? { win: 5, push: 1 }
    : { win: 1, push: 0 };
}

function calcRp(wins: number, pushes: number, rate: { win: number; push: number }) {
  return wins * rate.win + pushes * rate.push;
}

// ---------------------------------------------------------------------------
// Board config
// ---------------------------------------------------------------------------
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
    sports: ["NBA", "MLB"],
    isPulse: true,
    section: "daily",
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
    sports: ["NBA"],
    isPulse: false,
    section: "weekly",
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
    sports: ["MLB"],
    isPulse: false,
    section: "weekly",
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
    sports: ["SOCCER"],
    isPulse: false,
    section: "weekly",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LeaderboardHubPage() {
  const { user } = useAuth();

  const weekId    = useMemo(() => getWeekId(new Date()), []);
  const weekLabel = useMemo(() => getWeekRangeLabel(new Date(), "es-PR"), []);
  const dayId     = useMemo(() => getDayId(), []);
  const dayLabel  = useMemo(() => getDayLabel(dayId, "es-PR"), [dayId]);

  const [plan,         setPlan]         = useState<Plan>("free");
  const [weeklyRp,     setWeeklyRp]     = useState<RpSnapshot | null>(null);
  const [dailyRp,      setDailyRp]      = useState<RpSnapshot | null>(null);
  const [rpTab,        setRpTab]        = useState<"weekly" | "daily">("weekly");
  const [isRegistered, setIsRegistered] = useState(false); // daily tournament
  const [hasWeeklyPicks, setHasWeeklyPicks] = useState(false);
  const [loadingRp,    setLoadingRp]    = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoadingRp(false); return; }

    async function load() {
      if (!user) return;
      setLoadingRp(true);
      try {
        // 1. Get user plan
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userPlan: Plan = (userSnap.data() as any)?.plan === "premium" ? "premium" : "free";
        setPlan(userPlan);

        const wRate = weeklyRpRate(userPlan);
        const dRate = dailyRpRate(userPlan);

        // 2. Weekly picks (resolved wins/pushes this week)
        const weeklySnap = await getDocs(
          query(
            collection(db, "picks"),
            where("uid", "==", user.uid),
            where("weekId", "==", weekId),
            where("result", "in", ["win", "push"]),
          )
        );

        const wByNba: { wins: number; pushes: number } = { wins: 0, pushes: 0 };
        const wByMlb: { wins: number; pushes: number } = { wins: 0, pushes: 0 };
        const wBySoccer: { wins: number; pushes: number } = { wins: 0, pushes: 0 };
        let totalWWins = 0; let totalWPushes = 0;

        weeklySnap.forEach(d => {
          const p = d.data() as any;
          const sport = String(p.sport ?? "").toUpperCase();
          const isWin  = p.result === "win";
          const isPush = p.result === "push";
          if (isWin)  totalWWins++;
          if (isPush) totalWPushes++;
          if (sport === "NBA")    { if (isWin) wByNba.wins++;   else wByNba.pushes++;   }
          if (sport === "MLB")    { if (isWin) wByMlb.wins++;   else wByMlb.pushes++;   }
          if (sport === "SOCCER") { if (isWin) wBySoccer.wins++; else wBySoccer.pushes++; }
        });

        setHasWeeklyPicks(weeklySnap.size > 0 || totalWWins > 0);

        setWeeklyRp({
          wins:     totalWWins,
          pushes:   totalWPushes,
          rp:       calcRp(totalWWins, totalWPushes, wRate),
          byNba:    calcRp(wByNba.wins,    wByNba.pushes,    wRate),
          byMlb:    calcRp(wByMlb.wins,    wByMlb.pushes,    wRate),
          bySoccer: calcRp(wBySoccer.wins, wBySoccer.pushes, wRate),
        });

        // 3. Daily picks (resolved today)
        const dailySnap = await getDocs(
          query(
            collection(db, "picks_daily"),
            where("uid", "==", user.uid),
            where("dayId", "==", dayId),
            where("result", "in", ["win", "push"]),
          )
        );

        const dByNba: { wins: number; pushes: number } = { wins: 0, pushes: 0 };
        const dByMlb: { wins: number; pushes: number } = { wins: 0, pushes: 0 };
        let totalDWins = 0; let totalDPushes = 0;

        dailySnap.forEach(d => {
          const p = d.data() as any;
          const sport = String(p.sport ?? "").toUpperCase();
          const isWin  = p.result === "win";
          const isPush = p.result === "push";
          if (isWin)  totalDWins++;
          if (isPush) totalDPushes++;
          if (sport === "NBA") { if (isWin) dByNba.wins++; else dByNba.pushes++; }
          if (sport === "MLB") { if (isWin) dByMlb.wins++; else dByMlb.pushes++; }
        });

        setDailyRp({
          wins:     totalDWins,
          pushes:   totalDPushes,
          rp:       calcRp(totalDWins, totalDPushes, dRate),
          byNba:    calcRp(dByNba.wins, dByNba.pushes, dRate),
          byMlb:    calcRp(dByMlb.wins, dByMlb.pushes, dRate),
          bySoccer: 0,
        });

        // 4. Check daily tournament registration
        const regSnap = await getDocs(
          query(
            collection(db, "tournament_registrations"),
            where("uid", "==", user.uid),
            where("dayId", "==", dayId),
          )
        );
        setIsRegistered(!regSnap.empty);

      } catch (e) {
        console.error("LeaderboardHub RP load error:", e);
      } finally {
        setLoadingRp(false);
      }
    }

    load();
  }, [user?.uid, weekId, dayId]);

  // Which boards to show: daily only if registered, weekly always
  const dailyBoards  = BOARDS.filter(b => b.section === "daily");
  const weeklyBoards = BOARDS.filter(b => b.section === "weekly");

  const activeRp = rpTab === "weekly" ? weeklyRp : dailyRp;

  const rpRate = rpTab === "weekly" ? weeklyRpRate(plan) : dailyRpRate(plan);

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl">

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/30" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Rankings</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Leaderboard</h1>
          <p className="mt-1.5 text-sm text-white/35">Compite diario y semanal. ¿Dónde estás tú?</p>
        </div>

        {/* ── RP In-Progress Card ── */}
        {user?.uid && (
          <div className="mb-6 rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">

            {/* Card header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-base">🏅</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/35">Tus RP en curso</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/8 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                En vivo
              </span>
            </div>

            {/* Tabs: Semanal / Diario */}
            <div className="flex border-b border-white/[0.06]">
              <button
                onClick={() => setRpTab("weekly")}
                className={[
                  "flex-1 py-2.5 text-xs font-bold transition border-b-2",
                  rpTab === "weekly"
                    ? "border-white/40 text-white"
                    : "border-transparent text-white/30 hover:text-white/50",
                ].join(" ")}
              >
                Semanal · {weekId}
              </button>
              <button
                onClick={() => setRpTab("daily")}
                className={[
                  "flex-1 py-2.5 text-xs font-bold transition border-b-2",
                  rpTab === "daily"
                    ? "border-amber-400/60 text-amber-300"
                    : "border-transparent text-white/30 hover:text-white/50",
                ].join(" ")}
              >
                Diario · hoy
              </button>
            </div>

            {/* RP number */}
            {loadingRp ? (
              <div className="px-4 py-6 flex items-center gap-3">
                <div className="h-10 w-24 animate-pulse rounded-xl bg-white/5" />
                <div className="h-4 w-32 animate-pulse rounded-lg bg-white/5" />
              </div>
            ) : (
              <div className="px-4 py-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-black text-white tracking-tight">
                    {activeRp?.rp ?? 0}
                  </span>
                  <span className="text-sm font-bold text-white/30">RP</span>
                  <span className="ml-2 text-xs text-white/25">
                    {activeRp ? `${activeRp.wins}W · ${activeRp.pushes}P resueltos` : "sin picks resueltos"}
                  </span>
                </div>
                <p className="text-[11px] text-white/25 mb-4">
                  {rpTab === "weekly"
                    ? `${plan === "premium" ? "Premium" : "Regular"}: ×${rpRate.win} por win · ×${rpRate.push} por push`
                    : `${plan === "premium" ? "Premium" : "Regular"}: ×${rpRate.win} por win · ×${rpRate.push} por push`}
                </p>

                {/* Sport breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { sport: "NBA",    val: activeRp?.byNba ?? 0,    color: "text-blue-400",    wins: rpTab === "weekly" ? weeklyRp?.byNba : dailyRp?.byNba },
                    { sport: "MLB",    val: activeRp?.byMlb ?? 0,    color: "text-red-400",     wins: rpTab === "weekly" ? weeklyRp?.byMlb : dailyRp?.byMlb },
                    { sport: "Soccer", val: activeRp?.bySoccer ?? 0, color: "text-emerald-400", wins: rpTab === "weekly" ? weeklyRp?.bySoccer : null },
                  ].map(({ sport, val, color, wins }) => (
                    rpTab === "daily" && sport === "Soccer" ? null : (
                      <div key={sport}
                        className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
                        <div className={`text-lg font-black ${val > 0 ? color : "text-white/20"}`}>
                          {val}
                        </div>
                        <div className="text-[9px] text-white/25 uppercase tracking-wider mt-0.5">
                          {sport === "NBA" ? "🏀" : sport === "MLB" ? "⚾" : "⚽"} {sport}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SECCIÓN: Hoy ── */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Hoy · {dayLabel}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {dailyBoards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              label={dayLabel}
              isRegistered={isRegistered}
              showRegistration
            />
          ))}
        </div>

        {/* ── SECCIÓN: Esta semana ── */}
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Esta semana · {weekId}</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="flex flex-col gap-3">
            {weeklyBoards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                label={`${weekId} · ${weekLabel}`}
              />
            ))}
          </div>
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

// ---------------------------------------------------------------------------
// Board card sub-component
// ---------------------------------------------------------------------------
function BoardCard({
  board,
  label,
  isRegistered,
  showRegistration,
}: {
  board: typeof BOARDS[number];
  label: string;
  isRegistered?: boolean;
  showRegistration?: boolean;
}) {
  return (
    <Link
      href={board.href}
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
      <div className="flex flex-1 items-center gap-4 px-4 py-4">

        {/* Sport badges */}
        <div className="hidden sm:flex flex-col gap-1 shrink-0">
          {board.sports.map(s => (
            <span
              key={s}
              className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
              style={{ backgroundColor: `rgba(${board.accentRgb},0.12)`, color: board.accent }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-base font-black text-white tracking-tight">
              {board.title} <span className="font-light text-white/40">{board.subtitle}</span>
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${board.tagColor} flex items-center gap-1`}>
              {board.isPulse && <span className={`inline-flex h-1 w-1 rounded-full ${board.dot}`} />}
              {board.tag}
            </span>
            {/* Registered badge */}
            {showRegistration && isRegistered && (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                ✓ Inscrito
              </span>
            )}
          </div>
          <p className="text-xs text-white/35 line-clamp-1">{board.description}</p>
          <p className="mt-1 text-[11px] text-white/20">{label}</p>
        </div>

        {/* Arrow */}
        <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-sm text-white/30 transition-all duration-200 group-hover:border-white/15 group-hover:text-white/60 group-hover:translate-x-0.5">
          →
        </div>
      </div>

      {/* Bottom accent line */}
      <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${board.lineGradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
    </Link>
  );
}
