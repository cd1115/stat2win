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

  // ── market pill helper ──────────────────────────────────────────────────────
  const mkPill = (market: string) => {
    const label = market === "moneyline" ? "ML" : market === "spread" ? "Spread" : "O/U";
    const cls =
      market === "moneyline"
        ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
        : market === "spread"
          ? "border-purple-500/20 bg-purple-500/10 text-purple-300"
          : "border-amber-500/20 bg-amber-500/10 text-amber-300";
    return (
      <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
        {label}
      </span>
    );
  };

  // ── reusable game card ───────────────────────────────────────────────────────
  const renderGameCard = (
    sport: string,
    homeAbbr: string,
    awayAbbr: string,
    scoreHome: number | null | undefined,
    scoreAway: number | null | undefined,
    isFinal: boolean,
    status: string,
    startLabel: string,
    rows: Array<{ pick: PickDoc; outcome: string | null; text: string; points: number | null; final?: boolean; locked?: boolean; normalizedOutcome: string | null }>,
    cardKey: string | number,
    locked?: boolean,
  ) => {
    const hasWin = rows.some((r) => r.normalizedOutcome === "win");
    const hasLoss = rows.some((r) => r.normalizedOutcome === "loss");
    const hasPush = rows.some((r) => r.normalizedOutcome === "push");
    const cardTone = hasWin && hasLoss ? "mixed" : hasWin ? "win" : hasLoss ? "loss" : hasPush ? "push" : "pending";
    const accentBar =
      cardTone === "win" ? "bg-emerald-400" :
      cardTone === "loss" ? "bg-red-500" :
      cardTone === "push" ? "bg-yellow-400" : "bg-white/[0.08]";

    return (
      <div key={cardKey} className="relative rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${accentBar}`} />
        <div className="pl-[11px]">
          {/* Game header */}
          <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/10 pr-3 py-2">
            <div className="flex items-center gap-2">
              {isFinal ? (
                <span className="rounded-md border border-white/12 bg-white/6 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">Final</span>
              ) : status ? (
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${String(status).toLowerCase() === "inprogress" ? "border-red-400/20 bg-red-400/8 text-red-300/70" : "border-amber-400/20 bg-amber-400/8 text-amber-300/70"}`}>{String(status).toUpperCase()}</span>
              ) : (
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">Scheduled</span>
              )}
              <LeagueBadge sport={sport} size={13} />
              {locked && <span className="rounded-md border border-yellow-500/20 bg-yellow-500/8 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300/70">Locked</span>}
            </div>
            <span className="text-[10px] text-white/30">{startLabel}</span>
          </div>

          {/* Teams + score */}
          <div className="flex items-center gap-3 pr-3 py-3">
            <div className="flex flex-1 items-center gap-2">
              <TeamBadge sport={sport} abbr={awayAbbr} fallback={awayAbbr} />
              <div>
                <div className="text-sm font-semibold text-white">{awayAbbr}</div>
                <div className="text-[10px] text-white/35">Away</div>
              </div>
            </div>
            <div className="flex flex-col items-center min-w-[70px]">
              {isFinal && scoreHome != null && scoreAway != null ? (
                <>
                  <div className="text-base font-black tabular-nums text-white">{scoreAway} – {scoreHome}</div>
                  <div className="text-[9px] text-white/30 uppercase tracking-wider">Final</div>
                </>
              ) : (
                <div className="text-xs text-white/25">vs</div>
              )}
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{homeAbbr}</div>
                <div className="text-[10px] text-white/35">Home</div>
              </div>
              <TeamBadge sport={sport} abbr={homeAbbr} fallback={homeAbbr} />
            </div>
          </div>

          {/* Pick rows */}
          <div className="divide-y divide-white/[0.04]">
            {rows.map((row) => {
              const market = inferMarket(row.pick);
              const tone = row.normalizedOutcome;
              return (
                <div key={row.pick.id} className="flex items-center justify-between pr-3 py-2.5 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {mkPill(market)}
                    <div className="min-w-0">
                      <div className="text-[10px] text-white/35">Your pick</div>
                      <div className={`text-sm font-bold truncate ${tone === "win" ? "text-emerald-300" : tone === "loss" ? "text-red-300" : tone === "push" ? "text-yellow-300" : "text-white/80"}`}>
                        {row.text}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tone ? (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone === "win" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : tone === "loss" ? "border-red-400/25 bg-red-400/10 text-red-300" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-300"}`}>
                        {tone === "win" ? "WIN" : tone === "loss" ? "LOSS" : "PUSH"}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/35">
                        {row.final ? "Final" : "Pending"}
                      </span>
                    )}
                    <div className="text-right min-w-[44px]">
                      <div className="text-[9px] text-white/30">PTS</div>
                      <div className={`text-sm font-black tabular-nums ${tone === "win" ? "text-emerald-300" : tone === "push" ? "text-yellow-300" : tone === "loss" ? "text-white/25" : "text-white/50"}`}>
                        {row.points != null ? row.points : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── summary stats bar ────────────────────────────────────────────────────────
  const renderStats = (rows: typeof enriched) => {
    const wins = rows.filter((r) => r.outcome === "win").length;
    const losses = rows.filter((r) => r.outcome === "loss").length;
    const pts = rows.reduce((acc, r) => acc + (r.points ?? 0), 0);
    const decided = wins + losses;
    const wr = decided ? Math.round((wins / decided) * 100) : null;
    return (
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Win Rate", val: wr != null ? `${wr}%` : "—", color: "text-emerald-300" },
          { label: "Points", val: pts, color: "text-white" },
          { label: "Wins", val: wins, color: "text-emerald-300" },
          { label: "Losses", val: losses, color: "text-red-300" },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-center">
            <div className={`text-base font-black tabular-nums ${color}`}>{val}</div>
            <div className="text-[10px] text-white/30 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Protected>
      <div className="mx-auto w-full max-w-2xl px-3 py-4">

        {/* ── PAGE HEADER ── */}
        <div className="mb-4">
          {/* Title + segmented control */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-white tracking-tight">My Picks</h1>
            <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] p-0.5 gap-0.5">
              <button
                onClick={() => setModeTab("weekly")}
                className={["rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all", modeTab === "weekly" ? "bg-white/12 text-white" : "text-white/40 hover:text-white/70"].join(" ")}
              >
                Weekly
              </button>
              <button
                onClick={() => setModeTab("daily")}
                className={["rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5", modeTab === "daily" ? "bg-amber-400/10 text-amber-300" : "text-white/40 hover:text-white/70"].join(" ")}
              >
                <span className={`inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 ${modeTab === "daily" ? "animate-pulse" : "opacity-30"}`} />
                Daily
              </button>
            </div>
          </div>

          {/* Week navigation */}
          {modeTab === "weekly" && (
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-2 py-1.5 mb-3">
              <button onClick={() => setWeekOffset((v) => v - 1)} className="rounded-xl p-2 text-white/50 hover:bg-white/8 hover:text-white transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-white/35 uppercase tracking-wider">Week</span>
                <span className="text-sm font-semibold text-white">{weekLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                {weekOffset !== 0 && (
                  <button onClick={() => setWeekOffset(0)} className="rounded-lg px-2.5 py-1 text-xs text-white/40 hover:bg-white/8 hover:text-white/70 transition">Now</button>
                )}
                <button onClick={() => setWeekOffset((v) => v + 1)} className="rounded-xl p-2 text-white/50 hover:bg-white/8 hover:text-white transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Day navigation */}
          {modeTab === "daily" && (
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-2 py-1.5 mb-3">
              <button
                onClick={() => setDailyDayOffset((v) => Math.max(v - 1, -7))}
                disabled={dayId <= sevenDaysAgoCutoff}
                className={["rounded-xl p-2 transition", dayId <= sevenDaysAgoCutoff ? "text-white/15 cursor-default" : "text-white/50 hover:bg-white/8 hover:text-white"].join(" ")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-white/35 uppercase tracking-wider">{isToday ? "Today" : "Day"}</span>
                <span className={["text-sm font-semibold", isToday ? "text-amber-300" : "text-white"].join(" ")}>{dayLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                {!isToday && (
                  <button onClick={() => setDailyDayOffset(0)} className="rounded-lg px-2.5 py-1 text-xs text-white/40 hover:bg-white/8 hover:text-white/70 transition">Hoy</button>
                )}
                <button
                  onClick={() => setDailyDayOffset((v) => Math.min(v + 1, 0))}
                  disabled={isToday}
                  className={["rounded-xl p-2 transition", isToday ? "text-white/15 cursor-default" : "text-white/50 hover:bg-white/8 hover:text-white"].join(" ")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Underline tabs — weekly only */}
          {modeTab === "weekly" && (
            <div className="flex border-b border-white/[0.06]">
              {(["picks", "performance"] as ViewTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={["pb-2.5 px-1 mr-6 text-sm font-medium capitalize transition border-b-2 -mb-px", viewTab === tab ? "border-white text-white" : "border-transparent text-white/35 hover:text-white/60"].join(" ")}
                >
                  {tab === "picks" ? "Picks" : "Performance"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── ERROR ── */}
        {err && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}

        {/* ══════════════════════════════ DAILY MODE ══════════════════════════════ */}
        {modeTab === "daily" && (
          <div className="space-y-3">
            {dailyErr && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{dailyErr}</div>
            )}

            {dailyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
              </div>
            ) : dailyEnriched.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <div className="text-3xl mb-3">🎯</div>
                <div className="text-white/50 text-sm mb-4">
                  {isToday ? "No hay picks para hoy todavía." : `No hay picks para el ${dayLabel}.`}
                </div>
                {isToday && (
                  <div className="flex justify-center gap-2 flex-wrap">
                    <a href="/tournaments/daily?sport=NBA" className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/15 transition">NBA Daily →</a>
                    <a href="/tournaments/daily?sport=MLB" className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/15 transition">MLB Daily →</a>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Daily stats */}
                {renderStats(dailyEnriched)}

                {/* Sport pills */}
                {dailyGrouped.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
                    {dailyGrouped.map(({ sport }) => {
                      const meta = SPORT_META[sport as SportKey] ?? null;
                      return (
                        <div key={sport} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${meta?.soft ?? "border-white/10 bg-black/20"}`}>
                          <LeagueBadge sport={sport} size={13} />
                          <span className={meta?.accent ?? "text-white/70"}>{sport}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Game cards */}
                {dailyGrouped.map(({ sport, groups }) => {
                  const meta = SPORT_META[sport as SportKey];
                  return (
                    <div key={sport}>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <LeagueBadge sport={sport} size={15} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${meta?.accent ?? "text-white/70"}`}>{meta?.label ?? sport}</span>
                        <span className="text-[10px] text-white/25">{groups.reduce((acc, g) => acc + g.rows.length, 0)} pick(s)</span>
                      </div>
                      <div className="space-y-2">
                        {groups.map((group, gIdx) => {
                          const game = group.game;
                          const homeAbbr = game?.homeTeamAbbr || game?.homeTeam || game?.home || "HOME";
                          const awayAbbr = game?.awayTeamAbbr || game?.awayTeam || game?.away || "AWAY";
                          const { home: scoreHome, away: scoreAway } = getScores(game);
                          const isFinal = isFinalStatus(game?.status);
                          const sl = group.start ? prettyStartLabel(game, group.start) : prettyStartLabel(game);
                          const rows = group.rows.map((row) => ({ ...row, normalizedOutcome: row.outcome ?? null }));
                          return renderGameCard(sport, homeAbbr, awayAbbr, scoreHome, scoreAway, isFinal, String(group.status || ""), sl, rows, gIdx);
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════ WEEKLY PICKS ══════════════════════════════ */}
        {modeTab === "weekly" && viewTab === "picks" && (
          <div className="space-y-3">
            {/* Summary stats */}
            {!loading && enriched.length > 0 && renderStats(enriched)}

            {/* Sport filter + search */}
            {!loading && (
              <div className="space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-3 px-3">
                  {visibleSportFilters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPicksSportFilter("ALL")}
                      className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${picksSportFilter === "ALL" ? "border-white/25 bg-white/10 text-white" : "border-white/10 bg-black/20 text-white/50 hover:text-white/80"}`}
                    >
                      All · {enriched.length}
                    </button>
                  )}
                  {visibleSportFilters.map((sport) => {
                    const meta = SPORT_META[sport] ?? null;
                    const active = picksSportFilter === sport;
                    return (
                      <button
                        key={sport}
                        type="button"
                        onClick={() => setPicksSportFilter(sport)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? (meta?.soft ?? "border-white/20 bg-white/10") + " text-white" : "border-white/10 bg-black/20 text-white/50 hover:text-white/80"}`}
                      >
                        <LeagueBadge sport={sport} size={13} />
                        {meta?.label ?? sport}
                        <span className="opacity-60">{pickCountsBySport[sport] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search team, sport, or pick..."
                    className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/20"
                  />
                  <button onClick={refresh} className="shrink-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/60 hover:bg-white/8 hover:text-white transition">↻</button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
              </div>
            ) : groupedPicks.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <div className="text-2xl mb-2">🎯</div>
                <div className="text-white/50 text-sm">No picks found for this week.</div>
              </div>
            ) : (
              groupedPicks.map(({ sport, groups }) => {
                const meta = SPORT_META[sport as SportKey];
                return (
                  <div key={sport}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <LeagueBadge sport={sport} size={15} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${meta?.accent ?? "text-white/70"}`}>{meta?.label ?? sport}</span>
                      <span className="text-[10px] text-white/25">{groups.reduce((acc, g) => acc + g.rows.length, 0)} pick(s)</span>
                    </div>
                    <div className="space-y-2">
                      {groups.map((group) => {
                        const g = group.game;
                        const homeAbbr = g?.homeTeamAbbr || g?.homeTeam || g?.home || "HOME";
                        const awayAbbr = g?.awayTeamAbbr || g?.awayTeam || g?.away || "AWAY";
                        const { home: scoreHome, away: scoreAway } = getScores(g);
                        const isFinal = isFinalStatus(g?.status);
                        const raw = g?.startTime ?? g?.startsAt ?? null;
                        const ms = raw?._seconds ? raw._seconds * 1000 : raw?.seconds ? raw.seconds * 1000 : typeof raw === "number" ? raw : null;
                        const startObj = ms ? new Date(ms) : (group.start ?? null);
                        const sl = startObj
                          ? startObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                          : prettyStartLabel(g);
                        const rows = group.rows.map((row) => {
                          const io = row.outcome ?? (row.final ? ((row.points ?? 0) > 0 ? "win" : (row.points ?? 0) === 50 ? "push" : "loss") : null);
                          return { ...row, normalizedOutcome: io };
                        });
                        return renderGameCard(sport, homeAbbr, awayAbbr, scoreHome, scoreAway, isFinal, g?.status ? String(g.status) : "", sl, rows, `${sport}-${group.rows[0]?.pick.id ?? "g"}`, group.rows.some((r) => r.locked));
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ══════════════════════════ WEEKLY PERFORMANCE ════════════════════════ */}
        {modeTab === "weekly" && viewTab === "performance" && (
          <div className="space-y-4">
            {/* Sport filter */}
            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-3 px-3">
              {(["ALL", ...AVAILABLE_SPORTS] as PerfSport[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setPerfSport(k)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${perfSport === k ? "border-white/25 bg-white/10 text-white" : "border-white/10 bg-black/20 text-white/50 hover:text-white/70"}`}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Win Rate", val: `${perf.winRate}%`, sub: `${perf.wins}W · ${perf.losses}L · ${perf.pushes}P`, color: "text-emerald-300" },
                { label: "Points", val: perf.points, sub: `${perf.avgPoints} avg/pick`, color: "text-white" },
                { label: "Win Streak", val: perf.streak, sub: "Consecutive wins", color: "text-amber-300" },
                { label: "Resolved", val: perf.totalFinals, sub: `${perf.wins} wins · ${perf.losses} losses`, color: "text-white/60" },
              ].map(({ label, val, sub, color }) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="text-xs text-white/40 mb-1">{label}</div>
                  <div className={`text-2xl font-black tabular-nums ${color}`}>{val}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>

            {perf.totalFinals === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/50 text-center">
                No resolved picks yet. Charts will appear once picks settle.
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white mb-0.5">Win Rate by Day</div>
                  <div className="text-xs text-white/40 mb-4">Days with at least 1 resolved pick</div>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={perf.daySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
                        <Line type="monotone" dataKey="winRate" stroke="#60a5fa" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-sm font-semibold text-white mb-0.5">Points by Day</div>
                  <div className="text-xs text-white/40 mb-4">Total points earned per day</div>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perf.daySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
                        <Bar dataKey="points" fill="rgba(96,165,250,0.5)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {pieData.length > 0 && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-semibold text-white mb-0.5">Wins vs Losses</div>
                    <div className="text-xs text-white/40 mb-2">Distribution for resolved picks</div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40}>
                            {pieData.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={entry.name === "Wins" ? "#22c55e" : entry.name === "Losses" ? "#ef4444" : "#facc15"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-5 text-xs mt-2">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.name === "Wins" ? "#22c55e" : d.name === "Losses" ? "#ef4444" : "#facc15" }} />
                          <span className={d.name === "Wins" ? "text-green-400" : d.name === "Losses" ? "text-red-400" : "text-yellow-300"}>{d.name}</span>
                          <span className="font-bold text-white/70">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </Protected>
  );
}
