"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getDayId, getDayLabel } from "@/lib/day";

type Market = "moneyline" | "spread" | "ou";
type ViewTab = "picks" | "performance";
type ModeTab = "weekly" | "daily";
type SportKey = "NBA" | "NFL" | "SOCCER" | "MLB";
type PerfSport = "ALL" | SportKey;

const AVAILABLE_SPORTS: SportKey[] = ["NBA", "NFL", "SOCCER", "MLB"];
const NBA_LOGO_BASE = "/teams";
const MLB_LOGO_BASE = "/teams/mlb";

const SPORT_META: Record<
  SportKey,
  { label: string; accent: string; soft: string; leagueLogo?: string }
> = {
  NBA: {
    label: "NBA",
    accent: "text-blue-300",
    soft: "bg-blue-500/10 border-blue-500/20",
    leagueLogo: "/leagues/nba.svg",
  },
  NFL: {
    label: "NFL",
    accent: "text-emerald-300",
    soft: "bg-emerald-500/10 border-emerald-500/20",
    leagueLogo: "/leagues/nfl.png",
  },
  SOCCER: {
    label: "SOCCER",
    accent: "text-green-300",
    soft: "bg-green-500/10 border-green-500/20",
    leagueLogo: "/leagues/soccer.png",
  },
  MLB: {
    label: "MLB",
    accent: "text-red-300",
    soft: "bg-red-500/10 border-red-500/20",
    leagueLogo: "/leagues/mlb.svg",
  },
};

type PickDoc = {
  id: string;
  uid?: string;
  userId?: string;
  weekId: string;
  sport: string;
  gameId: string;
  gameDocId?: string;
  market?: Market;
  pick: "home" | "away" | "over" | "under" | string;
  line?: number | null;
  selection?: "HOME" | "AWAY" | "OVER" | "UNDER" | string;
  result?: "pending" | "win" | "loss" | "push";
  pointsAwarded?: number;
  createdAt?: any;
  updatedAt?: any;
};

type GameDoc = {
  id: string;
  gameId?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  home?: string;
  away?: string;
  markets?: {
    spread?: { line?: number; homeLine?: number; awayLine?: number };
    total?: { line?: number };
  };
  scoreHome?: number;
  scoreAway?: number;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  startTime?: any;
  startsAt?: any;
  winner?: "home" | "away" | string;
  weekId?: string;
  sport?: string;
  [k: string]: any;
};

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="text-sm font-semibold text-white">{title}</div>
      {subtitle ? (
        <div className="mt-1 text-xs text-white/60">{subtitle}</div>
      ) : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function safeDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function isFinalStatus(status?: string) {
  const s = String(status || "").toLowerCase();
  return (
    s === "final" || s === "finished" || s === "complete" || s === "completed"
  );
}

function getStart(game?: GameDoc): Date | null {
  if (!game) return null;
  return (
    safeDate(game.startTime) ||
    safeDate(game.startsAt) ||
    safeDate((game as any)?.gameTime) ||
    safeDate((game as any)?.dateTime) ||
    safeDate((game as any)?.scheduled) ||
    safeDate((game as any)?.startDateTime) ||
    safeDate((game as any)?.commenceTime) ||
    safeDate((game as any)?.startTimeUtc) ||
    safeDate((game as any)?.startTimeUTC) ||
    safeDate((game as any)?.start_time) ||
    null
  );
}

function isLocked(game?: GameDoc): boolean {
  const start = getStart(game);
  return !!start && Date.now() >= start.getTime();
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getScores(game?: GameDoc) {
  const home =
    typeof game?.scoreHome === "number"
      ? game.scoreHome
      : typeof game?.homeScore === "number"
        ? game.homeScore
        : null;
  const away =
    typeof game?.scoreAway === "number"
      ? game.scoreAway
      : typeof game?.awayScore === "number"
        ? game.awayScore
        : null;
  return { home, away };
}

function resolveWinnerSide(game?: GameDoc): "home" | "away" | null {
  if (!game || !isFinalStatus(game.status)) return null;
  if (game.winner) {
    const w = String(game.winner).toLowerCase();
    if (w === "home" || w === "away") return w as "home" | "away";
  }
  const { home, away } = getScores(game);
  if (home == null || away == null) return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return null;
}

function resolvePickSide(
  pickValue: any,
  game?: GameDoc,
): "home" | "away" | null {
  if (!pickValue) return null;
  const v = String(pickValue).toLowerCase();
  if (v === "home" || v === "away") return v as "home" | "away";
  if (pickValue === "HOME") return "home";
  if (pickValue === "AWAY") return "away";

  const homeTeam = String(
    game?.homeTeamAbbr || game?.homeTeam || game?.home || "",
  );
  const awayTeam = String(
    game?.awayTeamAbbr || game?.awayTeam || game?.away || "",
  );

  if (homeTeam && String(pickValue).toUpperCase() === homeTeam.toUpperCase())
    return "home";
  if (awayTeam && String(pickValue).toUpperCase() === awayTeam.toUpperCase())
    return "away";
  return null;
}

function inferMarket(p: PickDoc): Market {
  if (p.market === "moneyline" || p.market === "spread" || p.market === "ou")
    return p.market;
  const v = String(p.pick || "").toLowerCase();
  if (v === "over" || v === "under") return "ou";
  return "moneyline";
}

function getGameLines(game?: GameDoc) {
  const spreadLine =
    typeof game?.markets?.spread?.line === "number"
      ? game.markets.spread.line
      : typeof game?.markets?.spread?.homeLine === "number"
        ? game.markets.spread.homeLine
        : null;

  const totalLine =
    typeof game?.markets?.total?.line === "number"
      ? game.markets.total.line
      : null;

  return { spreadLine, totalLine };
}

function resolveOutcome(
  p: PickDoc,
  game?: GameDoc,
): {
  outcome: "win" | "loss" | "push" | null;
  points: number | null;
  won: boolean | null;
} {
  if (!game || !isFinalStatus(game.status))
    return { outcome: null, points: null, won: null };

  const { home, away } = getScores(game);
  if (home == null || away == null)
    return { outcome: null, points: null, won: null };

  const market = inferMarket(p);
  const { spreadLine, totalLine } = getGameLines(game);

  if (market === "moneyline") {
    const winner = resolveWinnerSide(game);
    const pickSide = resolvePickSide(p.pick, game);
    if (!winner || !pickSide) return { outcome: null, points: null, won: null };
    const win = pickSide === winner;
    return { outcome: win ? "win" : "loss", points: win ? 100 : 0, won: win };
  }

  if (market === "spread") {
    const line = typeof p.line === "number" ? p.line : spreadLine;
    const pickSide = resolvePickSide(p.pick, game);
    if (line == null || !pickSide)
      return { outcome: null, points: null, won: null };

    const homeMargin = home - away;
    const adjustedHome = homeMargin + Number(line);
    if (adjustedHome === 0) return { outcome: "push", points: 50, won: null };

    const winnerSide = adjustedHome > 0 ? "home" : "away";
    const win = pickSide === winnerSide;
    return { outcome: win ? "win" : "loss", points: win ? 100 : 0, won: win };
  }

  if (market === "ou") {
    const line = typeof p.line === "number" ? p.line : totalLine;
    const v = String(p.pick).toLowerCase();
    if (line == null || (v !== "over" && v !== "under")) {
      return { outcome: null, points: null, won: null };
    }

    const total = home + away;
    if (total === Number(line))
      return { outcome: "push", points: 50, won: null };
    const win = v === "over" ? total > Number(line) : total < Number(line);
    return { outcome: win ? "win" : "loss", points: win ? 100 : 0, won: win };
  }

  return { outcome: null, points: null, won: null };
}

function fmtTime(d: Date | null) {
  if (!d) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function prettyStartLabel(game?: GameDoc, start?: Date | null) {
  const parsed =
    start ||
    safeDate(game?.startTime) ||
    safeDate(game?.startsAt) ||
    safeDate((game as any)?.gameTime) ||
    safeDate((game as any)?.dateTime) ||
    safeDate((game as any)?.scheduled) ||
    safeDate((game as any)?.startDateTime) ||
    safeDate((game as any)?.commenceTime) ||
    safeDate((game as any)?.startTimeUtc) ||
    safeDate((game as any)?.startTimeUTC) ||
    safeDate((game as any)?.start_time) ||
    null;

  if (parsed) return fmtTime(parsed);

  const status = String(game?.status || "").toUpperCase();
  if (status) return status;

  return "Scheduled";
}

function inferOutcomeFromPoints(points?: number | null, final?: boolean) {
  if (!final || typeof points !== "number") return null;
  if (points >= 100) return "win" as const;
  if (points === 50) return "push" as const;
  if (points === 0) return "loss" as const;
  return null;
}

function teamLogoSrc(sport: string, abbr?: string) {
  const code = String(abbr || "")
    .trim()
    .toUpperCase();
  if (!code) return null;

  const sportKey = String(sport).toUpperCase();
  if (sportKey === "NBA") return `${NBA_LOGO_BASE}/${code}.png`;
  if (sportKey === "MLB") return `${MLB_LOGO_BASE}/${code}.png`;
  return null;
}

function LeagueBadge({ sport, size = 18 }: { sport: string; size?: number }) {
  const league = String(sport || "")
    .trim()
    .toLowerCase();

  if (!league) return null;

  return (
    <div
      className="flex items-center justify-center rounded-lg bg-white/10"
      style={{ width: size + 18, height: size + 18 }}
    >
      <img
        src={`/leagues/${league}.svg`}
        alt={sport}
        className="object-contain brightness-0 invert"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
function TeamBadge({
  sport,
  abbr,
  fallback,
}: {
  sport: string;
  abbr?: string;
  fallback: string;
}) {
  const src = teamLogoSrc(sport, abbr);
  const code = String(abbr || fallback || "")
    .trim()
    .toUpperCase();

  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      {src ? (
        <img
          src={src}
          alt={code}
          className="h-9 w-9 object-contain"
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = "none";
            const fallbackEl = img.nextElementSibling as HTMLElement | null;
            if (fallbackEl) fallbackEl.style.display = "flex";
          }}
        />
      ) : null}

      <div
        className="h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-xs font-semibold text-white/70"
        style={{ display: src ? "none" : "flex" }}
      >
        {code.slice(0, 3)}
      </div>
    </div>
  );
}

function teamLabel(v?: string | null) {
  if (!v) return "";
  const s = String(v).toUpperCase();
  return s.length > 3 ? s.slice(0, 3) : s;
}

function pickText(p: PickDoc, g?: GameDoc) {
  const market = inferMarket(p);
  const line = typeof p.line === "number" ? p.line : null;

  if (market === "moneyline") {
    const side = resolvePickSide(p.pick, g);
    if (side === "home")
      return teamLabel(g?.homeTeamAbbr || g?.homeTeam || g?.home);
    if (side === "away")
      return teamLabel(g?.awayTeamAbbr || g?.awayTeam || g?.away);
    return String(p.pick);
  }

  if (market === "spread") {
    const side = resolvePickSide(p.pick, g);
    const team =
      side === "home"
        ? teamLabel(g?.homeTeamAbbr || g?.homeTeam || g?.home)
        : teamLabel(g?.awayTeamAbbr || g?.awayTeam || g?.away);
    return line != null
      ? `${team} ${line > 0 ? "+" : ""}${line}`
      : `${team} (spread)`;
  }

  if (market === "ou") {
    const v = String(p.pick).toLowerCase();
    if (v === "over" || v === "under") {
      return line != null ? `${v.toUpperCase()} ${line}` : v.toUpperCase();
    }
  }

  return String(p.pick);
}

async function fetchWeekBundle(uid: string, weekId: string) {
  const functions = getFunctions(getApp());

  const callable = httpsCallable<
    { weekId: string },
    { ok: boolean; weekId: string; picks: PickDoc[]; games: GameDoc[] }
  >(functions, "getMyPicksWeek");

  const res = await callable({ weekId });

  return {
    picks: Array.isArray(res.data?.picks) ? res.data.picks : [],
    games: Array.isArray(res.data?.games) ? res.data.games : [],
  };
}

export default function PicksPage() {
  const { user } = useAuth();

  const [modeTab, setModeTab] = useState<ModeTab>("weekly");
  const [viewTab, setViewTab] = useState<ViewTab>("picks");
  const [picksSportFilter, setPicksSportFilter] = useState<PerfSport>("ALL");
  const [perfSport, setPerfSport] = useState<PerfSport>("ALL");
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<PickDoc[]>([]);
  const [games, setGames] = useState<GameDoc[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // ── Daily picks state ──
  // dayOffset: 0 = today, -1 = yesterday, -2 = two days ago, etc.
  const [dailyDayOffset, setDailyDayOffset] = useState(0);

  const todayDayId = useMemo(() => getDayId(), []);

  const dayId = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dailyDayOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, [dailyDayOffset]);

  // 7-day expiry cutoff
  const sevenDaysAgoCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, []);

  const isToday = dailyDayOffset === 0;
  const dayLabel = useMemo(() => getDayLabel(dayId, "es-PR"), [dayId]);
  const [dailyPicks, setDailyPicks] = useState<PickDoc[]>([]);
  const [dailyGames, setDailyGames] = useState<GameDoc[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyErr, setDailyErr] = useState<string | null>(null);

  const weekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekId = useMemo(() => getWeekId(weekDate), [weekDate]);
  const weekLabel = useMemo(
    () => getWeekRangeLabel(weekDate, "es-PR"),
    [weekDate],
  );

  const refresh = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setErr(null);
    try {
      const bundle = await fetchWeekBundle(user.uid, weekId);
      setPicks(bundle.picks);
      setGames(bundle.games);
    } catch (e: any) {
      console.error("My Picks refresh error:", e);
      setErr(
        [e?.code, e?.message, e?.details ? JSON.stringify(e.details) : ""]
          .filter(Boolean)
          .join(" | ") || "Could not load picks.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!user?.uid) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const bundle = await fetchWeekBundle(user.uid, weekId);
        if (!alive) return;
        setPicks(bundle.picks);
        setGames(bundle.games);
      } catch (e: any) {
        console.error("My Picks load error:", e);
        if (alive) setErr(e?.message ?? "Could not load picks.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.uid, weekId]);

  // ── Daily picks listener (today by default, navigable, expires after 7 days) ──
  useEffect(() => {
    if (!user?.uid || modeTab !== "daily") return;
    setDailyLoading(true);
    setDailyErr(null);
    let cancelled = false;

    // Only show picks within last 7 days
    if (dayId < sevenDaysAgoCutoff) {
      setDailyPicks([]);
      setDailyGames([]);
      setDailyLoading(false);
      return;
    }

    const q = query(
      collection(db, "picks_daily"),
      where("uid", "==", user.uid),
      where("dayId", "==", dayId),
    );

    const unsub = onSnapshot(
      q,
      async (snap) => {
        if (cancelled) return;
        const fetchedPicks = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setDailyPicks(fetchedPicks);

        // Fetch associated games from the "games" collection
        const gameIds = [
          ...new Set(
            fetchedPicks
              .map((p: any) => p.gameDocId || p.gameId)
              .filter(Boolean),
          ),
        ];
        if (gameIds.length > 0) {
          try {
            const {
              getDocs,
              query: fsQuery,
              collection: fsCol,
              where: fsWhere,
            } = await import("firebase/firestore");
            // Fetch games by their document IDs in batches of 10
            const batches: GameDoc[] = [];
            for (let i = 0; i < gameIds.length; i += 10) {
              const batch = gameIds.slice(i, i + 10);
              const gSnap = await getDocs(
                fsQuery(fsCol(db, "games"), fsWhere("__name__", "in", batch)),
              );
              gSnap.forEach((d) =>
                batches.push({ id: d.id, ...d.data() } as GameDoc),
              );
            }
            if (!cancelled) setDailyGames(batches);
          } catch {
            // games fetch failed, continue without them
          }
        } else {
          setDailyGames([]);
        }
        setDailyLoading(false);
      },
      (e) => {
        if (cancelled) return;
        setDailyErr(String((e as any)?.message ?? e));
        setDailyLoading(false);
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.uid, dayId, modeTab, sevenDaysAgoCutoff]);

  const gamesById = useMemo(() => {
    const map: Record<string, GameDoc> = {};
    for (const g of games) {
      const keys = [
        String(g.gameId ?? ""),
        String(g.id ?? ""),
        String((g as any).oddsEventId ?? ""),
        String((g as any).matchKey ?? ""),
        String((g as any).legacyMatchKey ?? ""),
      ].filter(Boolean);

      for (const k of keys) map[k] = g;
    }
    return map;
  }, [games]);

  // ── Daily games lookup map ──
  const dailyGamesById = useMemo(() => {
    const map: Record<string, GameDoc> = {};
    for (const g of dailyGames) {
      const keys = [
        String(g.gameId ?? ""),
        String(g.id ?? ""),
        String((g as any).oddsEventId ?? ""),
        String((g as any).matchKey ?? ""),
      ].filter(Boolean);
      for (const k of keys) map[k] = g;
    }
    return map;
  }, [dailyGames]);

  // ── Daily enriched picks (same logic as weekly) ──
  const dailyEnriched = useMemo(() => {
    return (dailyPicks as PickDoc[]).map((p) => {
      const g =
        dailyGamesById[p.gameId] ||
        (p.gameDocId ? dailyGamesById[p.gameDocId] : undefined);

      const computed = resolveOutcome(p, g);
      const final =
        p.result && p.result !== "pending" ? true : isFinalStatus(g?.status);
      const storedOutcome =
        p.result && p.result !== "pending" ? p.result : null;
      const outcome =
        storedOutcome ??
        computed.outcome ??
        inferOutcomeFromPoints(p.pointsAwarded, final);

      const points =
        outcome === "win"
          ? 100
          : outcome === "loss"
            ? 0
            : outcome === "push"
              ? 50
              : (computed.points ??
                (typeof p.pointsAwarded === "number" ? p.pointsAwarded : null));
      const start = getStart(g);
      const locked = isLocked(g);
      const text = pickText(p, g);

      return {
        pick: p,
        game: g,
        start,
        locked,
        points,
        final,
        won: outcome === "win" ? true : outcome === "loss" ? false : null,
        outcome,
        text,
        sport: String(p.sport || "").toUpperCase(),
      };
    });
  }, [dailyPicks, dailyGamesById]);

  // ── Daily grouped picks (same grouping logic as weekly) ──
  const dailyGrouped = useMemo(() => {
    const sportMap = new Map<
      string,
      Map<
        string,
        {
          sport: string;
          game: GameDoc | undefined;
          start: Date | null;
          rows: typeof dailyEnriched;
          status: string;
        }
      >
    >();

    for (const row of dailyEnriched) {
      const sport = String(row.pick.sport || "OTHER").toUpperCase();
      const gameKey =
        String(
          row.pick.gameDocId ||
            row.pick.gameId ||
            row.game?.id ||
            row.game?.gameId ||
            `${sport}-${row.pick.id}`,
        ) || `${sport}-${row.pick.id}`;

      if (!sportMap.has(sport)) sportMap.set(sport, new Map());
      const gameMap = sportMap.get(sport)!;
      const current = gameMap.get(gameKey) || {
        sport,
        game: row.game,
        start: row.start ?? null,
        rows: [],
        status: String(row.game?.status || ""),
      };
      current.rows.push(row);
      if (!current.game && row.game) current.game = row.game;
      if (!current.start && row.start) current.start = row.start;
      if (!current.status && row.game?.status)
        current.status = String(row.game.status);
      gameMap.set(gameKey, current);
    }

    return Array.from(sportMap.entries())
      .sort((a, b) => {
        const aIdx = AVAILABLE_SPORTS.indexOf(a[0] as SportKey);
        const bIdx = AVAILABLE_SPORTS.indexOf(b[0] as SportKey);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .map(([sport, gameMap]) => ({
        sport,
        groups: Array.from(gameMap.values())
          .map((group) => ({
            ...group,
            rows: [...group.rows].sort((a, b) => {
              const order = { moneyline: 0, spread: 1, ou: 2 } as Record<
                string,
                number
              >;
              return (
                (order[inferMarket(a.pick)] ?? 9) -
                  (order[inferMarket(b.pick)] ?? 9) ||
                (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)
              );
            }),
          }))
          .sort((a, b) => {
            const aPending = a.rows.some((r) => !r.outcome);
            const bPending = b.rows.some((r) => !r.outcome);
            if (aPending && !bPending) return -1;
            if (!aPending && bPending) return 1;
            return (b.start?.getTime() ?? 0) - (a.start?.getTime() ?? 0);
          }),
      }));
  }, [dailyEnriched]);

  const enriched = useMemo(() => {
    return picks.map((p) => {
      const g =
        gamesById[p.gameId] ||
        (p.gameDocId ? gamesById[p.gameDocId] : undefined);

      const computed = resolveOutcome(p, g);
      const final =
        p.result && p.result !== "pending" ? true : isFinalStatus(g?.status);
      const storedOutcome =
        p.result && p.result !== "pending" ? p.result : null;
      const outcome =
        storedOutcome ??
        computed.outcome ??
        inferOutcomeFromPoints(p.pointsAwarded, final);

      const points =
        outcome === "win"
          ? 100
          : outcome === "loss"
            ? 0
            : outcome === "push"
              ? 50
              : (computed.points ??
                (typeof p.pointsAwarded === "number" ? p.pointsAwarded : null));
      const start = getStart(g);
      const locked = isLocked(g);
      const text = pickText(p, g);

      return {
        pick: p,
        game: g,
        start,
        locked,
        points,
        final,
        won: outcome === "win" ? true : outcome === "loss" ? false : null,
        outcome,
        text,
        sport: String(p.sport || "").toUpperCase(),
      };
    });
  }, [picks, gamesById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enriched.filter((r) => {
      const sportRaw = String(r.pick.sport || "").toUpperCase();
      if (picksSportFilter !== "ALL" && sportRaw !== picksSportFilter) {
        return false;
      }

      if (!q) return true;

      const ht = String(
        r.game?.homeTeamAbbr || r.game?.homeTeam || r.game?.home || "",
      ).toLowerCase();
      const at = String(
        r.game?.awayTeamAbbr || r.game?.awayTeam || r.game?.away || "",
      ).toLowerCase();
      const txt = String(r.text || "").toLowerCase();
      const sport = String(r.pick.sport || "").toLowerCase();
      return (
        ht.includes(q) ||
        at.includes(q) ||
        txt.includes(q) ||
        sport.includes(q) ||
        String(r.pick.gameId).includes(q)
      );
    });
  }, [enriched, search, picksSportFilter]);

  const pickCountsBySport = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of enriched) {
      const sport = String(row.pick.sport || "OTHER").toUpperCase();
      counts[sport] = (counts[sport] ?? 0) + 1;
    }
    return counts;
  }, [enriched]);

  const visibleSportFilters = useMemo(
    () =>
      AVAILABLE_SPORTS.filter((sport) => (pickCountsBySport[sport] ?? 0) > 0),
    [pickCountsBySport],
  );

  const groupedPicks = useMemo(() => {
    const sportMap = new Map<
      string,
      Map<
        string,
        {
          sport: string;
          game: GameDoc | undefined;
          start: Date | null;
          rows: typeof filtered;
          status: string;
        }
      >
    >();

    for (const row of filtered) {
      const sport = String(row.pick.sport || "OTHER").toUpperCase();
      const gameKey =
        String(
          row.pick.gameDocId ||
            row.pick.gameId ||
            row.game?.id ||
            row.game?.gameId ||
            `${sport}-${row.pick.id}`,
        ) || `${sport}-${row.pick.id}`;

      if (!sportMap.has(sport)) {
        sportMap.set(sport, new Map());
      }

      const gameMap = sportMap.get(sport)!;
      const current = gameMap.get(gameKey) || {
        sport,
        game: row.game,
        start: row.start ?? null,
        rows: [],
        status: String(row.game?.status || ""),
      };

      current.rows.push(row);
      if (!current.game && row.game) current.game = row.game;
      if (!current.start && row.start) current.start = row.start;
      if (!current.status && row.game?.status)
        current.status = String(row.game.status);
      gameMap.set(gameKey, current);
    }

    return Array.from(sportMap.entries())
      .sort((a, b) => {
        const aIdx = AVAILABLE_SPORTS.indexOf(a[0] as SportKey);
        const bIdx = AVAILABLE_SPORTS.indexOf(b[0] as SportKey);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .map(([sport, gameMap]) => ({
        sport,
        groups: Array.from(gameMap.values())
          .map((group) => ({
            ...group,
            rows: [...group.rows].sort((a, b) => {
              const order = { moneyline: 0, spread: 1, ou: 2 } as Record<
                string,
                number
              >;
              return (
                (order[inferMarket(a.pick)] ?? 9) -
                  (order[inferMarket(b.pick)] ?? 9) ||
                (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0)
              );
            }),
          }))
          .sort((a, b) => {
            // ✅ Pending arriba, resueltos abajo
            const aPending = a.rows.some((r) => !r.outcome);
            const bPending = b.rows.some((r) => !r.outcome);
            if (aPending && !bPending) return -1;
            if (!aPending && bPending) return 1;

            // ✅ Dentro de cada grupo: más tarde arriba (8pm antes que 1pm)
            const aMs = a.start?.getTime() ?? 0;
            const bMs = b.start?.getTime() ?? 0;
            return bMs - aMs; // descendente = más reciente arriba
          }),
      }));
  }, [filtered]);

  const perfBase = useMemo(() => {
    if (perfSport === "ALL") return enriched;
    return enriched.filter(
      (r) => String(r.pick.sport).toUpperCase() === perfSport,
    );
  }, [enriched, perfSport]);

  const perf = useMemo(() => {
    const finals = perfBase
      .filter(
        (r) =>
          r.outcome === "win" || r.outcome === "loss" || r.outcome === "push",
      )
      .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

    const totalFinals = finals.length;
    const wins = finals.filter((r) => r.outcome === "win").length;
    const losses = finals.filter((r) => r.outcome === "loss").length;
    const pushes = finals.filter((r) => r.outcome === "push").length;
    const points = finals.reduce((acc, r) => acc + (r.points ?? 0), 0);
    const avgPoints = totalFinals
      ? Math.round((points / totalFinals) * 10) / 10
      : 0;
    const decided = wins + losses;
    const winRate = decided ? Math.round((wins / decided) * 100) : 0;

    let streak = 0;
    for (let i = finals.length - 1; i >= 0; i--) {
      if (finals[i].outcome === "win") streak++;
      else break;
    }

    const byDay = new Map<
      string,
      {
        date: string;
        wins: number;
        losses: number;
        pushes: number;
        finals: number;
        points: number;
      }
    >();

    for (const r of finals) {
      const dt = r.start ?? new Date(0);
      const k = r.start ? dayKey(dt) : "TBD";
      const cur = byDay.get(k) || {
        date: k,
        wins: 0,
        losses: 0,
        pushes: 0,
        finals: 0,
        points: 0,
      };

      cur.finals += 1;
      if (r.outcome === "win") cur.wins += 1;
      else if (r.outcome === "loss") cur.losses += 1;
      else cur.pushes += 1;
      cur.points += r.points ?? 0;
      byDay.set(k, cur);
    }

    const daySeries = Array.from(byDay.values())
      .filter((x) => x.date !== "TBD")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({
        date: x.date.slice(5),
        winRate:
          x.wins + x.losses
            ? Math.round((x.wins / (x.wins + x.losses)) * 100)
            : 0,
        points: x.points,
        finals: x.finals,
      }));

    return {
      totalFinals,
      wins,
      losses,
      pushes,
      winRate,
      points,
      avgPoints,
      streak,
      daySeries,
    };
  }, [perfBase]);

  const pieData = useMemo(() => {
    const arr = [
      { name: "Wins", value: perf.wins },
      { name: "Losses", value: perf.losses },
      { name: "Push", value: perf.pushes },
    ];
    return arr.filter((x) => x.value > 0);
  }, [perf]);

  return (
    <Protected>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <Card>
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold text-white">My Picks</h1>
                <p className="mt-1 text-white/60">
                  {modeTab === "daily"
                    ? isToday
                      ? "Tus picks de hoy, agrupados por juego."
                      : `Tus picks del ${dayLabel}.`
                    : "All your picks for the selected week, grouped by game."}
                </p>

                {/* Mode tabs: Weekly / Daily */}
                <div className="mt-4 flex items-center gap-1 rounded-2xl border border-white/8 bg-white/[0.02] p-1 w-fit">
                  <button
                    onClick={() => setModeTab("weekly")}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-medium transition-all",
                      modeTab === "weekly"
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/70",
                    ].join(" ")}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setModeTab("daily")}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5",
                      modeTab === "daily"
                        ? "bg-amber-400/10 border border-amber-400/20 text-amber-300"
                        : "text-white/40 hover:text-white/70",
                    ].join(" ")}
                  >
                    <span
                      className={`inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 ${modeTab === "daily" ? "animate-pulse" : "opacity-40"}`}
                    />
                    Daily
                  </button>
                </div>

                {/* Sub-tabs only for weekly mode */}
                {modeTab === "weekly" && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setViewTab("picks")}
                      className={`rounded-xl px-4 py-2 text-sm ${
                        viewTab === "picks"
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      Picks
                    </button>
                    <button
                      onClick={() => setViewTab("performance")}
                      className={`rounded-xl px-4 py-2 text-sm ${
                        viewTab === "performance"
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      Performance
                    </button>
                  </div>
                )}
              </div>

              {modeTab === "weekly" && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setWeekOffset((v) => v - 1)}
                    className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setWeekOffset((v) => v + 1)}
                    className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
                  >
                    Next →
                  </button>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80">
                    Week <span className="ml-2 text-white">{weekId}</span>
                  </div>
                </div>
              )}

              {modeTab === "daily" && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Day navigation */}
                  <div className="flex items-center rounded-xl border border-white/10 bg-black/20 p-0.5">
                    <button
                      onClick={() =>
                        setDailyDayOffset((v) => Math.max(v - 1, -7))
                      }
                      disabled={dayId <= sevenDaysAgoCutoff}
                      className={[
                        "rounded-lg px-3 py-1.5 text-sm transition",
                        dayId <= sevenDaysAgoCutoff
                          ? "text-white/20 cursor-default"
                          : "text-white/60 hover:bg-white/8 hover:text-white",
                      ].join(" ")}
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() => setDailyDayOffset(0)}
                      disabled={isToday}
                      className={[
                        "rounded-lg px-3 py-1.5 text-sm transition",
                        isToday
                          ? "text-white/20 cursor-default"
                          : "text-white/60 hover:bg-white/8 hover:text-white",
                      ].join(" ")}
                    >
                      Hoy
                    </button>
                    <button
                      onClick={() =>
                        setDailyDayOffset((v) => Math.min(v + 1, 0))
                      }
                      disabled={isToday}
                      className={[
                        "rounded-lg px-3 py-1.5 text-sm transition",
                        isToday
                          ? "text-white/20 cursor-default"
                          : "text-white/60 hover:bg-white/8 hover:text-white",
                      ].join(" ")}
                    >
                      Next →
                    </button>
                  </div>
                  <span
                    className={[
                      "rounded-2xl border px-4 py-2 text-sm",
                      isToday
                        ? "border-amber-400/20 bg-amber-400/8 text-amber-300/80"
                        : "border-white/10 bg-black/20 text-white/60",
                    ].join(" ")}
                  >
                    {isToday && (
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse mr-2" />
                    )}
                    {dayLabel}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 text-sm text-white/50">
              {modeTab === "daily"
                ? isToday
                  ? `Hoy · ${dayLabel}`
                  : dayLabel
                : weekLabel}
            </div>
          </div>
        </Card>

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {/* ── DAILY PICKS PANEL ── */}
        {modeTab === "daily" && (
          <div className="mt-6">
            {dailyErr && (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {dailyErr}
              </div>
            )}

            {/* Sport filter bar */}
            {!dailyLoading && dailyEnriched.length > 0 && (
              <Card>
                <div className="p-4 md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70">
                      {dailyEnriched.length} pick(s) · ayer
                    </div>
                    {dailyGrouped.map(({ sport }) => {
                      const meta = SPORT_META[sport as SportKey] ?? null;
                      return (
                        <div
                          key={sport}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm ${meta?.soft ?? "border-white/10 bg-black/20"}`}
                        >
                          <LeagueBadge sport={sport} size={16} />
                          <span
                            className={`font-medium ${meta?.accent ?? "text-white/70"}`}
                          >
                            {sport}
                          </span>
                          <span className="text-white/50">
                            {dailyGrouped
                              .find((g) => g.sport === sport)
                              ?.groups.reduce(
                                (acc, g) => acc + g.rows.length,
                                0,
                              ) ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}

            {dailyLoading ? (
              <Card>
                <div className="p-6 space-y-3">
                  <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
                  <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
                  <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
                </div>
              </Card>
            ) : dailyEnriched.length === 0 ? (
              <Card>
                <div className="p-6 md:p-8">
                  <div className="py-8 text-center">
                    <div className="text-2xl mb-3">🎯</div>
                    <div className="text-white/50 text-sm">
                      {isToday
                        ? "No hay picks para hoy todavía."
                        : `No hay picks para el ${dayLabel}.`}
                    </div>
                    {isToday && (
                      <div className="mt-4 flex justify-center gap-3">
                        <a
                          href="/tournaments/daily?sport=NBA"
                          className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/15 transition"
                        >
                          NBA Daily →
                        </a>
                        <a
                          href="/tournaments/daily?sport=MLB"
                          className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/15 transition"
                        >
                          MLB Daily →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {dailyGrouped.map(({ sport, groups }) => {
                  const meta = SPORT_META[sport as SportKey];
                  return (
                    <div key={sport} className="mt-4">
                      {/* Sport header */}
                      <div className="mb-3 flex items-center gap-3">
                        <LeagueBadge sport={sport} size={20} />
                        <span
                          className={`text-sm font-bold uppercase tracking-wider ${meta?.accent ?? "text-white/70"}`}
                        >
                          {meta?.label ?? sport}
                        </span>
                        <span className="text-xs text-white/30">
                          {groups.reduce((acc, g) => acc + g.rows.length, 0)}{" "}
                          pick(s)
                        </span>
                      </div>

                      {/* Game cards */}
                      <div className="space-y-3">
                        {groups.map((group, gIdx) => {
                          const game = group.game;
                          const homeAbbr =
                            game?.homeTeamAbbr ||
                            game?.homeTeam ||
                            game?.home ||
                            "HOME";
                          const awayAbbr =
                            game?.awayTeamAbbr ||
                            game?.awayTeam ||
                            game?.away ||
                            "AWAY";
                          const { home: scoreHome, away: scoreAway } =
                            getScores(game);
                          const isFinal = isFinalStatus(game?.status);
                          const startDate = group.start;

                          return (
                            <div
                              key={gIdx}
                              className="rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden"
                            >
                              {/* Game header */}
                              <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {isFinal ? (
                                    <span className="rounded-lg border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                                      Final
                                    </span>
                                  ) : group.status ? (
                                    <span className="rounded-lg border border-amber-400/20 bg-amber-400/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/70">
                                      {group.status}
                                    </span>
                                  ) : null}
                                  <LeagueBadge sport={sport} size={14} />
                                </div>
                                <span className="text-xs text-white/30">
                                  {startDate
                                    ? prettyStartLabel(game, startDate)
                                    : prettyStartLabel(game)}
                                </span>
                              </div>

                              {/* Teams + score */}
                              <div className="flex items-center gap-4 px-4 py-4">
                                <div className="flex flex-1 items-center gap-3">
                                  <TeamBadge
                                    sport={sport}
                                    abbr={awayAbbr}
                                    fallback={awayAbbr}
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      {awayAbbr}
                                    </div>
                                    <div className="text-xs text-white/40">
                                      Away
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-center gap-1 px-2">
                                  {isFinal &&
                                  scoreHome != null &&
                                  scoreAway != null ? (
                                    <>
                                      <div className="text-lg font-black tabular-nums text-white">
                                        {scoreAway} – {scoreHome}
                                      </div>
                                      <div className="text-[10px] text-white/30 uppercase tracking-wider">
                                        Final
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-white/30">
                                      vs
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-1 items-center justify-end gap-3">
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-white">
                                      {homeAbbr}
                                    </div>
                                    <div className="text-xs text-white/40">
                                      Home
                                    </div>
                                  </div>
                                  <TeamBadge
                                    sport={sport}
                                    abbr={homeAbbr}
                                    fallback={homeAbbr}
                                  />
                                </div>
                              </div>

                              {/* Pick rows */}
                              <div className="divide-y divide-white/[0.04]">
                                {group.rows.map((row) => {
                                  const market = inferMarket(row.pick);
                                  const marketLabel =
                                    market === "moneyline"
                                      ? "ML"
                                      : market === "spread"
                                        ? "Spread"
                                        : "O/U";

                                  return (
                                    <div
                                      key={row.pick.id}
                                      className={[
                                        "flex items-center justify-between px-4 py-3 gap-3",
                                        row.outcome === "win"
                                          ? "bg-emerald-500/5"
                                          : row.outcome === "loss"
                                            ? "bg-red-500/5"
                                            : row.outcome === "push"
                                              ? "bg-yellow-500/5"
                                              : "",
                                      ].join(" ")}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                        <span className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
                                          {marketLabel}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold text-white truncate">
                                            Your pick
                                          </div>
                                          <div
                                            className={[
                                              "text-sm font-black whitespace-nowrap overflow-hidden text-ellipsis",
                                              row.outcome === "win"
                                                ? "text-emerald-300"
                                                : row.outcome === "loss"
                                                  ? "text-red-300"
                                                  : row.outcome === "push"
                                                    ? "text-yellow-300"
                                                    : "text-white/80",
                                            ].join(" ")}
                                          >
                                            {row.text}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0">
                                        {/* Outcome badge */}
                                        {row.outcome ? (
                                          <span
                                            className={[
                                              "rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider",
                                              row.outcome === "win"
                                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                                : row.outcome === "loss"
                                                  ? "border-red-400/30 bg-red-400/10 text-red-300"
                                                  : "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
                                            ].join(" ")}
                                          >
                                            {row.outcome === "win"
                                              ? "WIN"
                                              : row.outcome === "loss"
                                                ? "LOSS"
                                                : "PUSH"}
                                          </span>
                                        ) : (
                                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/40">
                                            Pending
                                          </span>
                                        )}

                                        {/* Points */}
                                        <div className="text-right min-w-[60px]">
                                          <div className="text-xs text-white/30">
                                            Points
                                          </div>
                                          <div
                                            className={[
                                              "text-sm font-black tabular-nums",
                                              row.outcome === "win"
                                                ? "text-emerald-300"
                                                : row.outcome === "push"
                                                  ? "text-yellow-300"
                                                  : row.outcome === "loss"
                                                    ? "text-white/30"
                                                    : "text-white/50",
                                            ].join(" ")}
                                          >
                                            {row.points != null
                                              ? row.points
                                              : "—"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Daily summary */}
                {(() => {
                  const wins = dailyEnriched.filter(
                    (r) => r.outcome === "win",
                  ).length;
                  const losses = dailyEnriched.filter(
                    (r) => r.outcome === "loss",
                  ).length;
                  const pushes = dailyEnriched.filter(
                    (r) => r.outcome === "push",
                  ).length;
                  const pts = dailyEnriched.reduce(
                    (acc, r) => acc + (r.points ?? 0),
                    0,
                  );
                  const hasResolved = wins + losses + pushes > 0;
                  if (!hasResolved) return null;
                  return (
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {[
                        { label: "Wins", val: wins, color: "text-emerald-300" },
                        { label: "Losses", val: losses, color: "text-red-300" },
                        {
                          label: "Push",
                          val: pushes,
                          color: "text-yellow-300",
                        },
                        { label: "Points", val: pts, color: "text-white" },
                      ].map(({ label, val, color }) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-center"
                        >
                          <div className={`text-xl font-black ${color}`}>
                            {val}
                          </div>
                          <div className="text-[10px] text-white/30 mt-0.5">
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ── WEEKLY PICKS PANEL ── */}
        {modeTab === "weekly" && (
          <div className="mt-6">
            {viewTab === "picks" ? (
              <>
                <Card>
                  <div className="p-6 md:p-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70">
                          {loading
                            ? "Loading..."
                            : `${filtered.length} pick(s)`}
                        </div>

                        {!loading && (
                          <>
                            {visibleSportFilters.map((sport) => {
                              const meta = SPORT_META[sport] ?? null;
                              const picksCount = pickCountsBySport[sport] ?? 0;
                              const active = picksSportFilter === sport;

                              return (
                                <button
                                  key={sport}
                                  type="button"
                                  onClick={() => setPicksSportFilter(sport)}
                                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm transition ${
                                    active
                                      ? (meta?.soft ??
                                        "border-white/20 bg-white/10 text-white")
                                      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5"
                                  }`}
                                >
                                  <LeagueBadge sport={sport} size={18} />
                                  <span className="font-medium">
                                    {meta?.label ?? sport}
                                  </span>
                                  <span className="text-white/50">
                                    {picksCount}
                                  </span>
                                </button>
                              );
                            })}

                            {visibleSportFilters.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setPicksSportFilter("ALL")}
                                className={`rounded-2xl border px-4 py-2 text-sm transition ${
                                  picksSportFilter === "ALL"
                                    ? "border-white/20 bg-white/10 text-white"
                                    : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5"
                                }`}
                              >
                                All
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search team, sport, or pick..."
                          className="w-full md:w-80 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none"
                        />
                        <button
                          onClick={refresh}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                        >
                          Refresh
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="mt-6 space-y-5">
                  {groupedPicks.length === 0 && !loading ? (
                    <Card>
                      <div className="p-6 text-sm text-white/60">
                        No picks found for this week.
                      </div>
                    </Card>
                  ) : null}

                  {groupedPicks.map(({ sport, groups }) => {
                    const meta = SPORT_META[sport as SportKey];
                    return (
                      <div key={sport} className="space-y-3">
                        {/* Sport header — same style as daily */}
                        <div className="flex items-center gap-3 mb-1">
                          <LeagueBadge sport={sport} size={20} />
                          <span
                            className={`text-sm font-bold uppercase tracking-wider ${meta?.accent ?? "text-white/70"}`}
                          >
                            {meta?.label ?? sport}
                          </span>
                          <span className="text-xs text-white/30">
                            {groups.reduce((acc, g) => acc + g.rows.length, 0)}{" "}
                            pick(s)
                          </span>
                        </div>

                        {groups.map((group) => {
                          const g = group.game;
                          const homeAbbr =
                            g?.homeTeamAbbr || g?.homeTeam || g?.home || "HOME";
                          const awayAbbr =
                            g?.awayTeamAbbr || g?.awayTeam || g?.away || "AWAY";
                          const { home: scoreHome, away: scoreAway } =
                            getScores(g);
                          const isFinal = isFinalStatus(g?.status);
                          const startDate = group.start;

                          // Compute timestamp for game header
                          const raw = g?.startTime ?? g?.startsAt ?? null;
                          const ms = raw?._seconds
                            ? raw._seconds * 1000
                            : raw?.seconds
                              ? raw.seconds * 1000
                              : typeof raw === "number"
                                ? raw
                                : null;
                          const startObj = ms
                            ? new Date(ms)
                            : (startDate ?? null);
                          const startLabel = startObj
                            ? startObj.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : prettyStartLabel(g);

                          const normalized = group.rows.map((row) => {
                            const inferredOutcome =
                              row.outcome ??
                              (row.final
                                ? (row.points ?? 0) > 0
                                  ? "win"
                                  : (row.points ?? 0) === 50
                                    ? "push"
                                    : "loss"
                                : null);
                            return {
                              ...row,
                              normalizedOutcome: inferredOutcome,
                            };
                          });

                          const hasLoss = normalized.some(
                            (r) => r.normalizedOutcome === "loss",
                          );
                          const hasWin = normalized.some(
                            (r) => r.normalizedOutcome === "win",
                          );
                          const hasPush = normalized.some(
                            (r) => r.normalizedOutcome === "push",
                          );
                          const cardTone =
                            hasWin && hasLoss
                              ? "mixed"
                              : hasWin
                                ? "win"
                                : hasLoss
                                  ? "loss"
                                  : hasPush
                                    ? "push"
                                    : "pending";

                          return (
                            <div
                              key={`${sport}-${group.rows[0]?.pick.id ?? "group"}`}
                              className="rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden"
                            >
                              {/* Game header bar */}
                              <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {isFinal ? (
                                    <span className="rounded-lg border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                                      Final
                                    </span>
                                  ) : g?.status ? (
                                    <span
                                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                        String(g.status).toLowerCase() ===
                                        "inprogress"
                                          ? "border-red-400/20 bg-red-400/8 text-red-300/70"
                                          : "border-amber-400/20 bg-amber-400/8 text-amber-300/70"
                                      }`}
                                    >
                                      {String(g.status).toUpperCase()}
                                    </span>
                                  ) : (
                                    <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                                      Scheduled
                                    </span>
                                  )}
                                  <LeagueBadge sport={sport} size={14} />
                                  {group.rows.some((r) => r.locked) && (
                                    <span className="rounded-lg border border-yellow-500/20 bg-yellow-500/8 px-2 py-0.5 text-[10px] font-semibold text-yellow-300/70">
                                      Locked
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-white/30">
                                  {startLabel}
                                </span>
                              </div>

                              {/* Teams + score row */}
                              <div className="flex items-center gap-4 px-4 py-4">
                                <div className="flex flex-1 items-center gap-3">
                                  <TeamBadge
                                    sport={sport}
                                    abbr={awayAbbr}
                                    fallback={awayAbbr}
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      {awayAbbr}
                                    </div>
                                    <div className="text-xs text-white/40">
                                      Away
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col items-center gap-0.5 px-2 min-w-[90px]">
                                  {isFinal &&
                                  scoreHome != null &&
                                  scoreAway != null ? (
                                    <>
                                      <div className="text-xl font-black tabular-nums text-white">
                                        {scoreAway} – {scoreHome}
                                      </div>
                                      <div className="text-[10px] text-white/30 uppercase tracking-wider">
                                        Final
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-xs text-white/30">
                                      vs
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-1 items-center justify-end gap-3">
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-white">
                                      {homeAbbr}
                                    </div>
                                    <div className="text-xs text-white/40">
                                      Home
                                    </div>
                                  </div>
                                  <TeamBadge
                                    sport={sport}
                                    abbr={homeAbbr}
                                    fallback={homeAbbr}
                                  />
                                </div>
                              </div>

                              {/* Pick rows */}
                              <div className="divide-y divide-white/[0.04]">
                                {normalized.map((row) => {
                                  const tone = row.normalizedOutcome;
                                  const market = inferMarket(row.pick);
                                  const marketLabel =
                                    market === "moneyline"
                                      ? "ML"
                                      : market === "spread"
                                        ? "Spread"
                                        : "O/U";

                                  return (
                                    <div
                                      key={row.pick.id}
                                      className={[
                                        "flex items-center justify-between px-4 py-3.5 gap-3",
                                        tone === "win"
                                          ? "bg-emerald-500/5"
                                          : tone === "loss"
                                            ? "bg-red-500/5"
                                            : tone === "push"
                                              ? "bg-yellow-500/5"
                                              : "",
                                      ].join(" ")}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                        <span className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
                                          {marketLabel}
                                        </span>
                                        <div className="min-w-0">
                                          <div className="text-xs text-white/50">
                                            Your pick
                                          </div>
                                          <div
                                            className={[
                                              "text-sm font-black whitespace-nowrap overflow-hidden text-ellipsis",
                                              tone === "win"
                                                ? "text-emerald-300"
                                                : tone === "loss"
                                                  ? "text-red-300"
                                                  : tone === "push"
                                                    ? "text-yellow-300"
                                                    : "text-white/80",
                                            ].join(" ")}
                                          >
                                            {row.text}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0">
                                        {tone ? (
                                          <span
                                            className={[
                                              "rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider",
                                              tone === "win"
                                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                                : tone === "loss"
                                                  ? "border-red-400/30 bg-red-400/10 text-red-300"
                                                  : "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
                                            ].join(" ")}
                                          >
                                            {tone === "win"
                                              ? "WIN"
                                              : tone === "loss"
                                                ? "LOSS"
                                                : "PUSH"}
                                          </span>
                                        ) : (
                                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/40">
                                            {row.final ? "Final" : "Pending"}
                                          </span>
                                        )}

                                        <div className="grid grid-cols-2 gap-2 text-center">
                                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
                                            <div className="text-[10px] text-white/40">
                                              Points
                                            </div>
                                            <div
                                              className={[
                                                "text-sm font-black tabular-nums",
                                                tone === "win"
                                                  ? "text-emerald-300"
                                                  : tone === "push"
                                                    ? "text-yellow-300"
                                                    : tone === "loss"
                                                      ? "text-white/30"
                                                      : "text-white/60",
                                              ].join(" ")}
                                            >
                                              {row.points ?? "—"}
                                            </div>
                                          </div>
                                          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
                                            <div className="text-[10px] text-white/40">
                                              Market
                                            </div>
                                            <div className="text-sm font-black text-white/70 uppercase">
                                              {marketLabel}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <Card>
                  <div className="p-6 md:p-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-semibold text-white">
                          Performance
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          Based on resolved picks — Week {weekId}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-2xl border border-white/10 bg-black/20 p-1">
                          {(["ALL", ...AVAILABLE_SPORTS] as PerfSport[]).map(
                            (k) => (
                              <button
                                key={k}
                                onClick={() => setPerfSport(k)}
                                className={`rounded-xl px-4 py-2 text-sm ${
                                  perfSport === k
                                    ? "bg-white/10 text-white"
                                    : "text-white/70 hover:text-white"
                                }`}
                              >
                                {k}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Win rate</div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {perf.winRate}%
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          {perf.wins}-{perf.losses}-{perf.pushes} (resolved:{" "}
                          {perf.totalFinals})
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Streak</div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {perf.streak}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          Consecutive wins
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Points</div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {perf.points}
                        </div>
                        <div className="mt-1 text-xs text-white/40">
                          Avg: {perf.avgPoints}/resolved pick
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Wins</div>
                        <div className="mt-1 text-2xl font-semibold text-green-400">
                          {perf.wins}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Losses</div>
                        <div className="mt-1 text-2xl font-semibold text-red-400">
                          {perf.losses}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-xs text-white/60">Pushes</div>
                        <div className="mt-1 text-2xl font-semibold text-yellow-300">
                          {perf.pushes}
                        </div>
                      </div>
                    </div>

                    {perf.totalFinals === 0 ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                        No resolved picks yet for this filter. Once picks
                        settle, charts will populate automatically.
                      </div>
                    ) : null}
                  </div>
                </Card>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
                  <div className="md:col-span-6">
                    <ChartCard
                      title="Win rate by day"
                      subtitle="Only days with at least 1 resolved pick"
                    >
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={perf.daySeries}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(255,255,255,0.08)"
                            />
                            <XAxis
                              dataKey="date"
                              stroke="rgba(255,255,255,0.5)"
                            />
                            <YAxis stroke="rgba(255,255,255,0.5)" />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="winRate"
                              stroke="#60a5fa"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartCard>
                  </div>

                  <div className="md:col-span-6">
                    <ChartCard
                      title="Points by day"
                      subtitle="Total points earned per day (resolved picks)"
                    >
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={perf.daySeries}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="rgba(255,255,255,0.08)"
                            />
                            <XAxis
                              dataKey="date"
                              stroke="rgba(255,255,255,0.5)"
                            />
                            <YAxis stroke="rgba(255,255,255,0.5)" />
                            <Tooltip />
                            <Bar
                              dataKey="points"
                              fill="rgba(255,255,255,0.35)"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartCard>
                  </div>

                  <div className="lg:col-span-12">
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="text-sm font-semibold text-white">
                        Wins vs Losses
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        Distribution for resolved picks
                      </div>

                      <div className="mt-4 h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              outerRadius={90}
                            >
                              {pieData.map((entry, i) => (
                                <Cell
                                  key={`cell-${i}`}
                                  fill={
                                    entry.name === "Wins"
                                      ? "#22c55e"
                                      : entry.name === "Losses"
                                        ? "#ef4444"
                                        : "#facc15"
                                  }
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-3 flex justify-center gap-6 text-sm">
                        {pieData.map((d) => (
                          <div key={d.name} className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                background:
                                  d.name === "Wins"
                                    ? "#22c55e"
                                    : d.name === "Losses"
                                      ? "#ef4444"
                                      : "#facc15",
                              }}
                            />
                            <span
                              className={
                                d.name === "Wins"
                                  ? "text-green-400"
                                  : d.name === "Losses"
                                    ? "text-red-400"
                                    : "text-yellow-300"
                              }
                            >
                              {d.name}
                            </span>
                            <span className="font-semibold text-white/80">
                              {d.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Protected>
  );
}
