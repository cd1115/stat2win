"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";

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

type Market = "moneyline" | "spread" | "ou";
type ViewTab = "picks" | "performance";
type SportKey = "NBA" | "NFL";
type PerfSport = "ALL" | SportKey;

const AVAILABLE_SPORTS: SportKey[] = ["NBA", "NFL",];

const SPORT_META: Record<
  SportKey,
  { label: string; emoji: string; accent: string; soft: string }
> = {
  NBA: {
    label: "NBA",
    emoji: "🏀",
    accent: "text-blue-300",
    soft: "bg-blue-500/10 border-blue-500/20",
  },
  NFL: {
    label: "NFL",
    emoji: "🏈",
    accent: "text-emerald-300",
    soft: "bg-emerald-500/10 border-emerald-500/20",
  },
};

type PickDoc = {
  id: string;
  uid: string;
  weekId: string;
  sport: string;
  gameId: string;

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

  homeTeam?: string;
  awayTeam?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  home?: string;
  away?: string;

  markets?: {
    spread?: { line?: number };
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
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
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
    null
  );
}

function isLocked(game?: GameDoc): boolean {
  const start = getStart(game);
  if (!start) return false;
  return Date.now() >= start.getTime();
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
  if (!game) return null;
  if (!isFinalStatus(game.status)) return null;

  if (game.winner) {
    const w = String(game.winner).toLowerCase();
    if (w === "home" || w === "away") return w as any;
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
  if (v === "home" || v === "away") return v as any;
  if (pickValue === "HOME") return "home";
  if (pickValue === "AWAY") return "away";

  const homeTeam = (
    game?.homeTeamAbbr ||
    game?.homeTeam ||
    game?.home ||
    ""
  ).toString();
  const awayTeam = (
    game?.awayTeamAbbr ||
    game?.awayTeam ||
    game?.away ||
    ""
  ).toString();

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
    typeof (game as any)?.markets?.spread?.line === "number"
      ? (game as any).markets.spread.line
      : null;

  const totalLine =
    typeof (game as any)?.markets?.total?.line === "number"
      ? (game as any).markets.total.line
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
  if (!game) return { outcome: null, points: null, won: null };
  if (!isFinalStatus(game.status))
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
    const v = String(p.pick || "").toLowerCase();
    if (line == null || (v !== "over" && v !== "under"))
      return { outcome: null, points: null, won: null };

    const total = home + away;
    if (total === Number(line))
      return { outcome: "push", points: 50, won: null };

    const win = v === "over" ? total > Number(line) : total < Number(line);
    return { outcome: win ? "win" : "loss", points: win ? 100 : 0, won: win };
  }

  return { outcome: null, points: null, won: null };
}

function fmtTime(d: Date | null) {
  if (!d) return "TBD";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function teamLabel(s?: string) {
  const v = String(s || "");
  return v.length ? v.toUpperCase() : "—";
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
    const t =
      side === "home"
        ? teamLabel(g?.homeTeamAbbr || g?.homeTeam || g?.home)
        : teamLabel(g?.awayTeamAbbr || g?.awayTeam || g?.away);
    return line != null
      ? `${t} ${line > 0 ? "+" : ""}${line}`
      : `${t} (spread)`;
  }

  if (market === "ou") {
    const v = String(p.pick).toLowerCase();
    if (v === "over" || v === "under") {
      return line != null ? `${v.toUpperCase()} ${line}` : v.toUpperCase();
    }
    return String(p.pick);
  }

  return String(p.pick);
}

function getWeekId(date: Date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const w = String(weekNo).padStart(2, "0");
  return `${d.getUTCFullYear()}-W${w}`;
}

async function fetchPicksForUser(uid: string, weekId: string, sport: SportKey) {
  const picksRef = collection(db, "picks");
  const q = query(
    picksRef,
    where("uid", "==", uid),
    where("weekId", "==", weekId),
    where("sport", "==", sport),
  );

  const snap = await getDocs(q);
  const out: PickDoc[] = [];

  snap.forEach((d) => {
    const data = d.data() as any;
    out.push({
      id: d.id,
      uid: data.uid,
      weekId: data.weekId,
      sport: data.sport,
      gameId: String(data.gameId),
      market: data.market,
      pick: data.pick,
      line: typeof data.line === "number" ? data.line : null,
      selection: data.selection,
      result: data.result,
      pointsAwarded:
        typeof data.pointsAwarded === "number" ? data.pointsAwarded : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  });

  return out;
}

async function fetchGamesForWeek(weekId: string, sport: SportKey) {
  const gamesRef = collection(db, "games");
  const q = query(
    gamesRef,
    where("weekId", "==", weekId),
    where("sport", "==", sport),
  );

  const snap = await getDocs(q);
  const out: GameDoc[] = [];

  snap.forEach((d) => {
    const data = d.data() as DocumentData;
    out.push({ id: d.id, ...(data as any) });
  });

  return out;
}

async function fetchWeekBundle(uid: string, weekId: string) {
  const results = await Promise.all(
    AVAILABLE_SPORTS.map(async (sport) => {
      const [sportPicks, sportGames] = await Promise.all([
        fetchPicksForUser(uid, weekId, sport),
        fetchGamesForWeek(weekId, sport),
      ]);

      return { sport, sportPicks, sportGames };
    }),
  );

  return {
    picks: results.flatMap((x) => x.sportPicks),
    games: results.flatMap((x) => x.sportGames),
  };
}

export default function PicksPage() {
  const { user } = useAuth();

  const [viewTab, setViewTab] = useState<ViewTab>("picks");
  const [perfSport, setPerfSport] = useState<PerfSport>("ALL");
  const [weekId] = useState(() => getWeekId(new Date()));

  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<PickDoc[]>([]);
  const [games, setGames] = useState<GameDoc[]>([]);

  const [search, setSearch] = useState("");

  const [editingPick, setEditingPick] = useState<PickDoc | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const functions = getFunctions(getApp());

  const refresh = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const bundle = await fetchWeekBundle(user.uid, weekId);
      setPicks(bundle.picks);
      setGames(bundle.games);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!user?.uid) return;

    (async () => {
      setLoading(true);
      try {
        const bundle = await fetchWeekBundle(user.uid, weekId);
        if (!alive) return;
        setPicks(bundle.picks);
        setGames(bundle.games);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.uid, weekId]);

  const gamesById = useMemo(() => {
    const m: Record<string, GameDoc> = {};
    for (const g of games) {
      const k = String((g as any).gameId ?? g.id);
      m[k] = g;
    }
    return m;
  }, [games]);

  const enriched = useMemo(() => {
    return picks.map((p) => {
      const g = gamesById[p.gameId];
      const start = getStart(g);
      const locked = isLocked(g);
      const { outcome, won, points } = resolveOutcome(p, g);
      const final = isFinalStatus(g?.status);
      const text = pickText(p, g);

      return {
        pick: p,
        game: g,
        start,
        locked,
        points,
        final,
        won,
        outcome,
        text,
        sport: String(p.sport || "").toUpperCase(),
      };
    });
  }, [picks, gamesById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = enriched;

    if (!q) return base;

    return base.filter((r) => {
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
  }, [enriched, search]);

  const groupedPicks = useMemo(() => {
    const grouped = new Map<string, typeof filtered>();

    for (const row of filtered) {
      const sport = String(row.pick.sport || "OTHER").toUpperCase();
      const current = grouped.get(sport) || [];
      current.push(row);
      grouped.set(sport, current);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => {
        const aIdx = AVAILABLE_SPORTS.indexOf(a[0] as SportKey);
        const bIdx = AVAILABLE_SPORTS.indexOf(b[0] as SportKey);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .map(([sport, rows]) => ({
        sport,
        rows: [...rows].sort(
          (a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0),
        ),
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
          r.final &&
          (r.outcome === "win" || r.outcome === "loss" || r.outcome === "push"),
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
      .map((x) => {
        const decidedDay = x.wins + x.losses;
        return {
          date: x.date.slice(5),
          winRate: decidedDay ? Math.round((x.wins / decidedDay) * 100) : 0,
          points: x.points,
          finals: x.finals,
        };
      });

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
    const wins = perf?.wins ?? 0;
    const losses = perf?.losses ?? 0;
    const pushes = perf?.pushes ?? 0;

    const arr = [
      { name: "Wins", value: wins },
      { name: "Losses", value: losses },
      { name: "Push", value: pushes },
    ];

    return arr.filter((x) => x.value > 0);
  }, [perf]);

  const openEdit = (p: PickDoc) => {
    setEditingPick(p);
    setEditValue(String(p.pick ?? ""));
  };

  const closeEdit = () => {
    setEditingPick(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingPick || !user?.uid) return;

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "updatePick");
      await fn({
        pickId: editingPick.id,
        uid: user.uid,
        pick: editValue,
      });
      closeEdit();
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const setTab = (tab: ViewTab) => {
    setViewTab(tab);
    if (tab === "performance") setSearch("");
  };

  return (
    <Protected>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <Card>
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold text-white">My Picks</h1>
                <p className="mt-1 text-white/60">
                  All your picks for the week, grouped by sport.
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => setTab("picks")}
                    className={`rounded-xl px-4 py-2 text-sm ${
                      viewTab === "picks"
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Picks
                  </button>
                  <button
                    onClick={() => setTab("performance")}
                    className={`rounded-xl px-4 py-2 text-sm ${
                      viewTab === "performance"
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Performance
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80">
                  Week <span className="ml-2 text-white">{weekId}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6">
          {viewTab === "picks" ? (
            <>
              <Card>
                <div className="p-6 md:p-8">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/70">
                        {loading ? "Loading..." : `${filtered.length} pick(s)`}
                      </div>

                      {!loading &&
                        groupedPicks.map(({ sport, rows }) => {
                          const meta =
                            SPORT_META[sport as SportKey] ?? null;

                          return (
                            <div
                              key={sport}
                              className={`rounded-2xl border px-4 py-2 text-sm text-white/80 ${
                                meta?.soft ?? "border-white/10 bg-black/20"
                              }`}
                            >
                              <span className="mr-2">{meta?.emoji ?? "🎯"}</span>
                              <span className="font-medium">
                                {meta?.label ?? sport}
                              </span>
                              <span className="ml-2 text-white/50">
                                {rows.length}
                              </span>
                            </div>
                          );
                        })}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search team, sport, or pick..."
                        className="w-80 max-w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none"
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

              <div className="mt-6 space-y-6">
                {groupedPicks.length === 0 && !loading ? (
                  <Card>
                    <div className="p-6 text-sm text-white/60">
                      No picks found for this week.
                    </div>
                  </Card>
                ) : null}

                {groupedPicks.map(({ sport, rows }) => {
                  const meta = SPORT_META[sport as SportKey];

                  return (
                    <div key={sport} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-2xl border px-4 py-2 ${
                              meta?.soft ?? "border-white/10 bg-black/20"
                            }`}
                          >
                            <span className="mr-2">{meta?.emoji ?? "🎯"}</span>
                            <span className="text-sm font-semibold text-white">
                              {meta?.label ?? sport}
                            </span>
                          </div>
                          <div className="text-sm text-white/45">
                            {rows.length} pick(s)
                          </div>
                        </div>
                      </div>

                      {rows.map((row) => {
                        const g = row.game;
                        const pick = row.pick;

                        const ht = teamLabel(
                          g?.homeTeamAbbr || g?.homeTeam || g?.home,
                        );
                        const at = teamLabel(
                          g?.awayTeamAbbr || g?.awayTeam || g?.away,
                        );

                        const status = String(g?.status || "").toLowerCase();
                        const final = isFinalStatus(g?.status);

                        return (
                          <Card key={pick.id}>
                            <div className="p-5 md:p-6">
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/80">
                                      {final ? "Final" : status || "scheduled"}
                                    </span>

                                    <span
                                      className={`rounded-full border px-3 py-1 text-xs ${
                                        meta?.soft ??
                                        "border-white/10 bg-black/20 text-white/80"
                                      } ${meta?.accent ?? "text-white/80"}`}
                                    >
                                      {meta?.label ?? sport}
                                    </span>

                                    {row.locked ? (
                                      <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200">
                                        Locked
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="mt-3 text-xl font-semibold text-white">
                                    {at} @ {ht}
                                  </div>

                                  <div className="mt-1 text-sm text-white/60">
                                    {fmtTime(row.start)} • {pick.weekId}
                                  </div>

                                  {row.locked ? (
                                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                                      Picks are locked because the game has
                                      started.
                                    </div>
                                  ) : null}
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-2">
                                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
                                    <div className="text-xs text-white/60">
                                      Your pick
                                    </div>
                                    <div className="text-base font-semibold text-white">
                                      {row.text}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                                      <div className="text-xs text-white/60">
                                        Points
                                      </div>
                                      <div className="text-base font-semibold text-white">
                                        {row.points ?? "—"}
                                      </div>
                                    </div>

                                    <button
                                      disabled={row.locked}
                                      onClick={() => openEdit(pick)}
                                      className={`rounded-2xl border px-4 py-3 text-sm ${
                                        row.locked
                                          ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                                          : "border-white/15 bg-white/10 text-white hover:bg-white/15"
                                      }`}
                                    >
                                      Change pick
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Card>
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
                        Based on FINAL games — Week {weekId}
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
                        {perf.wins}-{perf.losses}-{perf.pushes} (finals:{" "}
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
                        Avg: {perf.avgPoints}/final pick
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
                      No FINAL games yet. Once games finish, charts will
                      populate automatically.
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-6">
                  <ChartCard
                    title="Win rate by day"
                    subtitle="Only days with at least 1 final game"
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
                    subtitle="Total points earned per day (final games)"
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
                          <Bar dataKey="points" fill="rgba(255,255,255,0.35)" />
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
                      Distribution for finished games
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

        {editingPick ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0b12] p-5 shadow-xl">
              <div className="text-lg font-semibold text-white">
                Change pick
              </div>
              <div className="mt-1 text-sm text-white/60">
                Enter your new selection (home/away/over/under or team).
              </div>

              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none"
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={closeEdit}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className={`rounded-2xl px-4 py-2 text-sm ${
                    saving
                      ? "cursor-not-allowed bg-white/10 text-white/50"
                      : "bg-white/15 text-white hover:bg-white/20"
                  }`}
                >
                  {saving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Protected>
  );
}