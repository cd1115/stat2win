"use client";

import { listenMyPicksByWeekAndSport } from "@/lib/firestore-picks";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { listenGamesByWeekAndSport, type GameDoc } from "@/lib/firestore-games";
import type { PickDoc } from "@/lib/firestore-picks";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

type StatusTab = "all" | "scheduled" | "inprogress" | "final";
type MarketTab = "all" | "moneyline" | "spread" | "ou";

interface PlayerProp {
  playerId: string;
  playerName: string;
  playerRole: "pitcher" | "batter";
  team: string;
  market: string;
  line: number;
  overOdds?: number | null;
  underOdds?: number | null;
}

const PROP_LABEL: Record<string, string> = {
  pitcher_strikeouts: "Strikeouts",
  pitcher_hits_allowed: "Hits Allowed",
  batter_home_runs: "Home Runs",
  batter_hits: "Hits",
  batter_rbis: "RBIs",
  batter_strikeouts: "Strikeouts",
};

function fmtStart(ts: any) {
  try {
    const d: Date =
      ts?.toDate?.() instanceof Date
        ? ts.toDate()
        : ts instanceof Date
          ? ts
          : typeof ts === "number"
            ? new Date(ts)
            : null;
    if (!d) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function scoreText(g: GameDoc) {
  const home = typeof g?.scoreHome === "number" ? g.scoreHome : 0;
  const away = typeof g?.scoreAway === "number" ? g.scoreAway : 0;
  return `${String(g.awayTeam ?? "").trim()} ${away} • ${String(g.homeTeam ?? "").trim()} ${home}`;
}

function effectiveStatus(
  g: GameDoc,
): "scheduled" | "inprogress" | "final" | "locked" {
  const raw = String(g?.status ?? "").toLowerCase();
  if (raw === "final") return "final";
  if (raw === "inprogress") return "inprogress";

  const startMs =
    g?.startTime?.toMillis?.() ?? g?.startTime?.toDate?.()?.getTime?.() ?? null;

  if (typeof startMs === "number" && Number.isFinite(startMs)) {
    if (Date.now() >= startMs) return "inprogress";
  }

  if (raw === "locked") return "locked";
  return "scheduled";
}

function isClosed(g: GameDoc) {
  const status = effectiveStatus(g);
  return status === "inprogress" || status === "final" || status === "locked";
}

function isSamePrDay(ts: any, now = new Date()) {
  const d: Date =
    ts?.toDate?.() instanceof Date
      ? ts.toDate()
      : ts instanceof Date
        ? ts
        : typeof ts === "number"
          ? new Date(ts)
          : (null as any);

  if (!d) return false;

  const prDate = new Date(
    d.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
  );
  const prNowDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }),
  );

  return (
    prDate.getFullYear() === prNowDate.getFullYear() &&
    prDate.getMonth() === prNowDate.getMonth() &&
    prDate.getDate() === prNowDate.getDate()
  );
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

function stableGameKey(g: any): string {
  const candidates = [
    g?.gameId,
    g?.matchKey,
    g?.oddsEventId,
    g?.legacyMatchKey,
    g?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const x = candidate.trim();
      if (!isEpochMs13(x)) return x;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const x = String(candidate);
      if (!isEpochMs13(x)) return x;
    }
  }
  return "";
}

function dedupeGames(rows: GameDoc[]) {
  const map = new Map<string, GameDoc>();

  const quality = (g: any) => {
    let score = 0;
    if (g?.mlbGamePk) score += 5;
    if (g?.markets?.moneyline) score += 2;
    if (
      g?.markets?.spread?.homeLine != null ||
      g?.markets?.spread?.awayLine != null
    )
      score += 3;
    if (g?.markets?.total?.line != null) score += 3;
    if (g?.scoreHome != null || g?.scoreAway != null) score += 2;
    if (g?.status === "final" || g?.status === "inprogress") score += 1;
    return score;
  };

  for (const g of rows) {
    const startMs =
      g?.startTime?.toMillis?.() ?? g?.startTime?.toDate?.()?.getTime?.() ?? 0;

    const key = `${String(g?.awayTeam ?? "").trim()}_${String(g?.homeTeam ?? "").trim()}_${startMs}`;
    const prev = map.get(key);
    if (!prev || quality(g) > quality(prev)) {
      map.set(key, g);
    }
  }

  return Array.from(map.values());
}

function getSpread(g: any) {
  const sp = g?.markets?.spread ?? g?.markets?.sp ?? null;

  const homeLine =
    typeof sp?.homeLine === "number"
      ? sp.homeLine
      : typeof sp?.lineHome === "number"
        ? sp.lineHome
        : typeof sp?.home === "number"
          ? sp.home
          : typeof sp?.line === "number"
            ? sp.line
            : null;

  const awayLine =
    typeof sp?.awayLine === "number"
      ? sp.awayLine
      : typeof sp?.lineAway === "number"
        ? sp.lineAway
        : typeof sp?.away === "number"
          ? sp.away
          : typeof homeLine === "number"
            ? -homeLine
            : null;

  return { homeLine, awayLine };
}

function getTotal(g: any) {
  const t = g?.markets?.total ?? g?.markets?.totals ?? g?.markets?.ou ?? null;

  const line =
    typeof t?.line === "number"
      ? t.line
      : typeof t?.total === "number"
        ? t.total
        : typeof t?.points === "number"
          ? t.points
          : null;

  return { line };
}

function badgeBase() {
  return "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70";
}

function marketChip(active: boolean) {
  return [
    "rounded-xl border px-3 py-2 text-sm transition",
    active
      ? "border-white/20 bg-white/10 text-white"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
  ].join(" ");
}

function showLine(n: number | null, prefixPlus = true) {
  if (typeof n !== "number") return "—";
  if (n > 0 && prefixPlus) return `+${n}`;
  return `${n}`;
}

function pickCell(active: boolean, disabled: boolean) {
  if (disabled)
    return "rounded-xl border border-white/6 bg-white/[0.02] py-2.5 px-3 text-center opacity-30 cursor-not-allowed select-none";
  return [
    "rounded-xl border py-2.5 px-3 text-center transition-all duration-150 cursor-pointer select-none",
    active
      ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/20"
      : "border-white/8 bg-white/[0.03] text-white/65 hover:bg-white/[0.07] hover:border-white/15 hover:text-white/90",
  ].join(" ");
}

function marketLabel(m: MarketTab) {
  if (m === "all") return "All";
  if (m === "moneyline") return "Moneyline";
  if (m === "spread") return "Spread";
  return "O/U";
}

function formatCallableError(e: any) {
  const code = e?.code ? String(e.code) : "";
  const msg = e?.message ? String(e.message) : "Unknown error";
  const details =
    e?.details != null
      ? typeof e.details === "string"
        ? e.details
        : JSON.stringify(e.details)
      : "";

  return [code && `(${code})`, msg, details && `details=${details}`]
    .filter(Boolean)
    .join(" | ");
}

const MLB_TEAM_CODES: Record<string, string> = {
  "Arizona Diamondbacks": "ARI",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "LA Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  Athletics: "OAK",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "Seattle Mariners": "SEA",
  "San Francisco Giants": "SF",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function normalizeMlbCode(value: string) {
  const v = String(value || "")
    .trim()
    .toUpperCase();
  const alias: Record<string, string> = {
    KCR: "KC",
    CHW: "CWS",
    SFG: "SF",
    SDP: "SD",
    TBR: "TB",
    WAS: "WSH",
  };
  return alias[v] ?? v;
}

function teamAbbrFrom(g: any, side: "home" | "away") {
  const explicit =
    side === "home"
      ? (g?.homeTeamAbbr ?? g?.homeAbbr ?? g?.teams?.homeAbbr)
      : (g?.awayTeamAbbr ?? g?.awayAbbr ?? g?.teams?.awayAbbr);

  if (typeof explicit === "string" && explicit.trim()) {
    return normalizeMlbCode(explicit);
  }

  const name = side === "home" ? g?.homeTeam : g?.awayTeam;

  if (typeof name === "string" && MLB_TEAM_CODES[name]) {
    return MLB_TEAM_CODES[name];
  }

  const fromName =
    typeof name === "string" && name.trim()
      ? name.trim().slice(0, 3).toUpperCase()
      : "";

  return normalizeMlbCode(fromName || (side === "home" ? "HOME" : "AWAY"));
}

function TeamLogo({ code, size = 40 }: { code: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const safeCode = String(code || "")
    .trim()
    .toUpperCase();
  const src = `/teams/mlb/${safeCode}.png`;

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5"
      style={{ width: size, height: size }}
    >
      {!imgError ? (
        <Image
          src={src}
          alt={safeCode}
          width={size}
          height={size}
          className="h-full w-full object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-sm font-semibold text-white">
          {safeCode.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

type OptimisticPick = Partial<PickDoc> & {
  market: "moneyline" | "spread" | "ou";
  pick: "home" | "away" | "over" | "under";
};

export default function MlbTournamentPage() {
  const { user } = useAuth();
  const sport = "MLB" as const;

  const [weekOffset, setWeekOffset] = useState(0);

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

  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPicks, setMyPicks] = useState<PickDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [market, setMarket] = useState<MarketTab>("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [optimisticPicks, setOptimisticPicks] = useState<
    Record<string, OptimisticPick>
  >({});

  const { plan } = useUserEntitlements();
  const isPremium = plan === "premium";

  // ── Player props map: gameId → PlayerProp[] ──
  const [propsMap, setPropsMap] = useState<Map<string, PlayerProp[]>>(
    new Map(),
  );

  // Also store raw props docs for team-name fallback matching
  const [propsDocsRaw, setPropsDocsRaw] = useState<any[]>([]);

  useEffect(() => {
    if (!weekId) return;
    const q2 = query(
      collection(db, "player_props_games"),
      where("sport", "==", "MLB"),
      where("weekId", "==", weekId),
    );
    return onSnapshot(
      q2,
      (snap) => {
        const m = new Map<string, PlayerProp[]>();
        const raw: any[] = [];
        for (const doc of snap.docs) {
          const data = doc.data() as any;
          if (!Array.isArray(data.props)) continue;
          raw.push(data);
          // Index by every possible ID key
          const keys = [
            data.gameId,
            doc.id,
            data.oddsEventId,
            data.matchKey,
            data.legacyMatchKey,
          ]
            .filter(Boolean)
            .map((k: any) => String(k).trim())
            .filter(Boolean);
          for (const k of keys) m.set(k, data.props);
          // Also index by "HomeTeam_AwayTeam" for fallback
          const homeKey = String(data.homeTeam ?? "").trim();
          const awayKey = String(data.awayTeam ?? "").trim();
          if (homeKey && awayKey) {
            m.set(`${homeKey}_${awayKey}`, data.props);
            m.set(`${awayKey}_${homeKey}`, data.props);
          }
        }
        console.log("[PropsDebug] propsMap keys:", Array.from(m.keys()));
        console.log(
          "[PropsDebug] raw docs:",
          raw.map((d: any) => ({
            gameId: d.gameId,
            homeTeam: d.homeTeam,
            awayTeam: d.awayTeam,
            propsCount: d.props?.length,
          })),
        );
        setPropsDocsRaw(raw);
        setPropsMap(m);
      },
      () => {},
    );
  }, [weekId]);

  const placePlayerPropFn = useMemo(
    () => httpsCallable(functions, "placePlayerPropPick"),
    [],
  );

  // prop picks map: pickKey → pick doc
  const [propPicks, setPropPicks] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid || !weekId) {
      setPropPicks([]);
      return;
    }
    const q2 = query(
      collection(db, "player_prop_picks"),
      where("uid", "==", user.uid),
      where("weekId", "==", weekId),
      where("sport", "==", "MLB"),
    );
    return onSnapshot(
      q2,
      (snap) => {
        setPropPicks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      () => {},
    );
  }, [user?.uid, weekId]);

  const propPickMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of propPicks) {
      const k = String((p as any).pickKey ?? "").trim();
      if (k) m.set(k, p);
    }
    return m;
  }, [propPicks]);

  const placePickFn = useMemo(() => httpsCallable(functions, "placePick"), []);

  function pushNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3500);
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setErr(null);
    if (!weekId) return;

    const unsub = listenGamesByWeekAndSport(
      sport as any,
      weekId,
      (rows) => setGames(dedupeGames(rows)),
      (e) => setErr(String((e as any)?.message ?? e)),
    );

    return () => unsub?.();
  }, [sport, weekId]);

  useEffect(() => {
    setErr(null);

    if (!user?.uid || !weekId) {
      setMyPicks([]);
      return;
    }

    const unsub = listenMyPicksByWeekAndSport(
      user.uid,
      weekId,
      sport,
      (rows: PickDoc[]) => setMyPicks(rows),
    );

    return () => unsub?.();
  }, [user?.uid, weekId, sport]);

  const pickMap = useMemo(() => {
    const m = new Map<string, PickDoc>();

    const put = (id: any, market: any, p: PickDoc) => {
      if (!id || !market) return;
      const key = `${String(id).trim()}:${String(market).trim()}`;
      if (!m.has(key)) m.set(key, p);
    };

    for (const p of myPicks) {
      put((p as any).gameId, (p as any).market, p);
      put((p as any).externalGameId, (p as any).market, p);
      put((p as any).gameDocId, (p as any).market, p);
      put((p as any).id, (p as any).market, p);
    }

    return m;
  }, [myPicks]);

  const filteredGames = useMemo(() => {
    let rows = [...games];

    rows.sort((a, b) => {
      const at = a.startTime?.toMillis?.() ?? 0;
      const bt = b.startTime?.toMillis?.() ?? 0;
      return at - bt;
    });

    const qq = q.trim().toLowerCase();
    if (qq) {
      rows = rows.filter(
        (g) =>
          String(g.homeTeam ?? "")
            .toLowerCase()
            .includes(qq) ||
          String(g.awayTeam ?? "")
            .toLowerCase()
            .includes(qq),
      );
    }

    if (statusFilter !== "all") {
      rows = rows.filter((g) => effectiveStatus(g) === statusFilter);
    }

    if (market === "spread") {
      rows = rows.filter((g) => {
        const sp = getSpread(g);
        return (
          typeof sp.homeLine === "number" || typeof sp.awayLine === "number"
        );
      });
    }

    if (market === "ou") {
      rows = rows.filter((g) => typeof getTotal(g).line === "number");
    }

    return rows;
  }, [games, q, statusFilter, market, weekId]);

  const sectioned = useMemo(() => {
    const now = new Date();

    const startMs = (g: GameDoc) =>
      g.startTime?.toMillis?.() ?? g.startTime?.toDate?.()?.getTime?.() ?? 0;

    // Returns numeric YYYYMMDD in Puerto Rico timezone for safe comparison
    const prDayNum = (d: Date): number => {
      const s = d.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" });
      const p = new Date(s);
      return p.getFullYear() * 10000 + (p.getMonth() + 1) * 100 + p.getDate();
    };

    const todayNum = prDayNum(now);

    const gameDayNum = (g: GameDoc): number | null => {
      const ms = startMs(g);
      return ms ? prDayNum(new Date(ms)) : null;
    };

    if (statusFilter !== "all") {
      const rows = [...filteredGames].sort((a, b) => startMs(a) - startMs(b));
      return { mode: "flat" as const, total: rows.length, rows };
    }

    const rows = [...filteredGames];

    // Only Firestore-confirmed inprogress go to LIVE
    const live = rows
      .filter((g) => String(g?.status ?? "").toLowerCase() === "inprogress")
      .sort((a, b) => startMs(a) - startMs(b));

    const liveSet = new Set(live.map((g) => g.id));

    const today = rows
      .filter((g) => {
        if (liveSet.has(g.id)) return false;
        const s = String(g?.status ?? "").toLowerCase();
        if (s === "final" || s === "inprogress") return false;
        return gameDayNum(g) === todayNum;
      })
      .sort((a, b) => startMs(a) - startMs(b));

    const upcoming = rows
      .filter((g) => {
        if (liveSet.has(g.id)) return false;
        const s = String(g?.status ?? "").toLowerCase();
        if (s === "final" || s === "inprogress") return false;
        const d = gameDayNum(g);
        return d !== null && d > todayNum;
      })
      .sort((a, b) => startMs(a) - startMs(b));

    const past = rows
      .filter((g) => {
        if (liveSet.has(g.id)) return false;
        const s = String(g?.status ?? "").toLowerCase();
        if (s === "final") return true;
        if (s === "inprogress") return false;
        const d = gameDayNum(g);
        return d !== null && d < todayNum;
      })
      .sort((a, b) => startMs(b) - startMs(a));

    const total = live.length + today.length + upcoming.length + past.length;

    return {
      mode: "sections" as const,
      total,
      live,
      today,
      upcoming,
      past,
    };
  }, [filteredGames, statusFilter]);

  async function savePick(args: {
    g: GameDoc;
    market: "moneyline" | "spread" | "ou";
    pick: "home" | "away" | "over" | "under";
    line: number | null;
    selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  }) {
    if (!user?.uid) return;

    const gameKey = String(
      (args.g as any).gameId ?? stableGameKey(args.g) ?? "",
    ).trim();
    const gameKeySafe = gameKey || String(args.g.id);

    if (!gameKeySafe) {
      pushNotice(
        "Este juego tiene un gameId inválido (timestamp). No se puede pickear.",
      );
      return;
    }

    if (isClosed(args.g)) return;

    const key = `${gameKeySafe}:${args.market}`;

    const existing =
      (optimisticPicks[key] as any) ||
      pickMap.get(`${gameKeySafe}:${args.market}`) ||
      pickMap.get(`${gameKey}:${args.market}`) ||
      pickMap.get(`${String(args.g.id)}:${args.market}`);

    const selectionForMarket = (() => {
      if (args.market === "moneyline") {
        return args.pick === "home"
          ? teamAbbrFrom(args.g, "home")
          : teamAbbrFrom(args.g, "away");
      }
      return args.selection;
    })();

    const canonicalSelection = args.pick;
    const marketKey =
      args.market === "moneyline"
        ? "ml"
        : args.market === "spread"
          ? "sp"
          : "ou";

    const teamAbbr =
      args.market === "moneyline"
        ? args.pick === "home"
          ? teamAbbrFrom(args.g, "home")
          : teamAbbrFrom(args.g, "away")
        : null;

    if (existing?.pick === args.pick) {
      setSavingKey(key);
      setErr(null);
      setNotice(null);

      setOptimisticPicks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const payload = {
          uid: user.uid,
          sport,
          sportKey: "mlb",
          league: "mlb",
          weekId,
          gameId: (args.g as any).gameId ?? gameKey,
          externalGameId: gameKey,
          gameDocId: args.g.id,
          market: args.market,
          marketKey,
          pick: canonicalSelection,
          selection: canonicalSelection,
          teamAbbr,
          line: args.line,
          selectionLegacy: args.selection,
          selectionForMarket,
          clear: true,
        };

        await placePickFn(payload);
      } catch (e: any) {
        setOptimisticPicks((prev) => ({
          ...prev,
          [key]: {
            market: args.market,
            pick: existing?.pick ?? canonicalSelection,
            ...(existing?.selectionForMarket
              ? { selectionForMarket: existing.selectionForMarket }
              : {}),
            ...(existing?.teamAbbr ? { teamAbbr: existing.teamAbbr } : {}),
          } as any,
        }));
        setErr(formatCallableError(e));
      } finally {
        setSavingKey(null);
      }
      return;
    }

    if (args.market === "moneyline") {
      const existingSpread =
        optimisticPicks[`${gameKeySafe}:spread`] ||
        pickMap.get(`${gameKeySafe}:spread`) ||
        pickMap.get(`${gameKey}:spread`) ||
        pickMap.get(`${String(args.g.id)}:spread`);
      if ((existingSpread as any)?.pick) {
        pushNotice(
          "No puedes combinar Moneyline y Spread en el mismo juego. Quita el pick de Spread (My Picks) y luego selecciona Moneyline.",
        );
        return;
      }
    }

    if (args.market === "spread") {
      const existingML =
        optimisticPicks[`${gameKeySafe}:moneyline`] ||
        pickMap.get(`${gameKeySafe}:moneyline`) ||
        pickMap.get(`${gameKey}:moneyline`) ||
        pickMap.get(`${String(args.g.id)}:moneyline`);
      if ((existingML as any)?.pick) {
        pushNotice(
          "No puedes combinar Spread y Moneyline en el mismo juego. Quita el pick de Moneyline (My Picks) y luego selecciona Spread.",
        );
        return;
      }
    }

    setSavingKey(key);
    setErr(null);
    setNotice(null);

    setOptimisticPicks((prev) => ({
      ...prev,
      [key]: {
        market: args.market,
        pick: canonicalSelection,
        selectionForMarket,
        ...(teamAbbr ? { teamAbbr } : {}),
      } as any,
    }));

    try {
      const payload = {
        uid: user.uid,
        sport,
        sportKey: "mlb",
        league: "mlb",
        weekId,
        gameId: (args.g as any).gameId ?? gameKey,
        externalGameId: gameKey,
        gameDocId: args.g.id,
        market: args.market,
        marketKey,
        pick: canonicalSelection,
        selection: canonicalSelection,
        teamAbbr,
        line: args.line,
        selectionLegacy: args.selection,
        selectionForMarket,
      };

      await placePickFn(payload);
    } catch (e: any) {
      setOptimisticPicks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setErr(formatCallableError(e));
    } finally {
      setSavingKey(null);
    }
  }

  const renderGame = (g: GameDoc, idx: number) => {
    const effective = effectiveStatus(g);
    const closed = isClosed(g);
    const isLive = effective === "inprogress";
    const isFinal = effective === "final";
    const start = fmtStart(g.startTime);
    const gameKey = String((g as any).gameId ?? stableGameKey(g) ?? "").trim();
    const gameKeySafe = gameKey || String((g as any).id ?? "").trim();
    const key = gameKeySafe || `${g.awayTeam}-${g.homeTeam}-${idx}`;

    const pickFor = (mk: "moneyline" | "spread" | "ou") => {
      const k = `${gameKeySafe}:${mk}`;
      return (
        (optimisticPicks[k] as any) ||
        pickMap.get(`${gameKeySafe}:${mk}`) ||
        pickMap.get(`${gameKey}:${mk}`) ||
        pickMap.get(`${String((g as any).id ?? "").trim()}:${mk}`) ||
        null
      );
    };

    const pickML = pickFor("moneyline");
    const pickSpread = pickFor("spread");
    const pickOU = pickFor("ou");

    const { homeLine, awayLine } = getSpread(g);
    const { line: totalLine } = getTotal(g);

    const awayAbbr = teamAbbrFrom(g, "away");
    const homeAbbr = teamAbbrFrom(g, "home");

    const mlPicked =
      (pickML as any)?.selectionForMarket ?? (pickML as any)?.teamAbbr ?? null;
    const mlAwayActive =
      mlPicked === awayAbbr ||
      (mlPicked == null && (pickML as any)?.pick === "away");
    const mlHomeActive =
      mlPicked === homeAbbr ||
      (mlPicked == null && (pickML as any)?.pick === "home");

    const busy =
      savingKey && gameKeySafe && savingKey.startsWith(`${gameKeySafe}:`);

    // Props for this game — try multiple key formats + fuzzy team-name fallback
    const oddsEventId = String((g as any).oddsEventId ?? "").trim();
    const matchKey = String((g as any).matchKey ?? "").trim();
    const homeTeamKey = String(g.homeTeam ?? "").trim();
    const awayTeamKey = String(g.awayTeam ?? "").trim();
    const gDocId = String((g as any).id ?? "").trim();

    // Normalize: last word of team name, lowercase ("Houston Astros" → "astros")
    const normTeam = (t: string) =>
      t.trim().toLowerCase().split(/\s+/).pop() ?? t.toLowerCase();
    const homeNorm = normTeam(homeTeamKey);
    const awayNorm = normTeam(awayTeamKey);

    // Start-of-day match: same calendar day
    const gStartMs =
      g.startTime?.toMillis?.() ?? g.startTime?.toDate?.()?.getTime?.() ?? 0;
    const gDay = new Date(gStartMs).toDateString();

    console.log(
      `[PropsDebug] game: ${g.awayTeam} @ ${g.homeTeam} | trying keys:`,
      {
        gameKey,
        gameKeySafe,
        gDocId,
        oddsEventId,
        matchKey,
        homeTeamKey,
        awayTeamKey,
        homeNorm,
        awayNorm,
      },
    );
    const gameProps =
      propsMap.get(gameKey) ??
      propsMap.get(gameKeySafe) ??
      propsMap.get(gDocId) ??
      propsMap.get(oddsEventId) ??
      propsMap.get(matchKey) ??
      // Fuzzy scan: match by normalized last word of team + same game day
      propsDocsRaw.find((d) => {
        const dHome = normTeam(String(d.homeTeam ?? ""));
        const dAway = normTeam(String(d.awayTeam ?? ""));
        const dMs =
          d.startTime?.toMillis?.() ??
          d.startTime?.toDate?.()?.getTime?.() ??
          (d.startTime?.seconds != null ? d.startTime.seconds * 1000 : 0);
        const dDay = new Date(dMs).toDateString();
        return dHome === homeNorm && dAway === awayNorm && dDay === gDay;
      })?.props ??
      // Even more relaxed: just team names, any day this week
      propsDocsRaw.find((d) => {
        const dHome = normTeam(String(d.homeTeam ?? ""));
        const dAway = normTeam(String(d.awayTeam ?? ""));
        return dHome === homeNorm && dAway === awayNorm;
      })?.props ??
      [];
    const pitchers = gameProps.filter(
      (p: PlayerProp) => p.playerRole === "pitcher",
    );
    const batters = gameProps.filter(
      (p: PlayerProp) => p.playerRole === "batter",
    );

    async function handlePropPick(prop: PlayerProp, side: "over" | "under") {
      if (!user?.uid) return;
      const propKey = `${gameKey}:${prop.playerId}:${prop.market}`;
      const current = propPickMap.get(propKey);
      const isToggle = current?.pick === side;
      try {
        await placePlayerPropFn({
          sport: "MLB",
          weekId,
          gameId: gameKey,
          pickKey: propKey,
          market: prop.market,
          pick: side,
          clear: isToggle,
          playerId: prop.playerId,
          playerName: prop.playerName,
          playerRole: prop.playerRole,
          team: prop.team,
          line: prop.line,
        });
      } catch (e: any) {
        pushNotice(String(e?.message ?? e));
      }
    }

    function resultDot(pick: any) {
      if (!pick?.result || pick.result === "pending") return null;
      const c =
        pick.result === "win"
          ? "bg-emerald-400"
          : pick.result === "loss"
            ? "bg-red-400"
            : "bg-amber-400";
      return <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c}`} />;
    }

    return (
      <div
        key={key}
        className="overflow-hidden rounded-2xl border border-white/8 bg-[#0c0c0e]"
      >
        {/* ── Header ── */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          {isLive && (
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
          )}
          {isFinal && (
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          )}

          {/* Teams with logos */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <TeamLogo code={awayAbbr} size={28} />
              <span className="text-sm font-black text-white/80">
                {awayAbbr}
              </span>
            </div>
            <span className="text-[10px] font-bold text-white/20">@</span>
            <div className="flex items-center gap-1.5">
              <TeamLogo code={homeAbbr} size={28} />
              <span className="text-sm font-black text-white">{homeAbbr}</span>
            </div>

            <span
              className={[
                "ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[9px] font-black uppercase tracking-wide flex-shrink-0",
                isFinal
                  ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400"
                  : isLive
                    ? "border-red-400/20 bg-red-500/8 text-red-400"
                    : "border-white/8 bg-white/[0.03] text-white/30",
              ].join(" ")}
            >
              {isLive && (
                <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
              )}
              {isFinal ? "Final" : isLive ? "Live" : "Scheduled"}
            </span>

            {isFinal && (
              <span className="text-sm font-black text-white/50">
                {g.scoreAway ?? "?"} – {g.scoreHome ?? "?"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {start && !isFinal && (
              <span className="text-[11px] text-white/20 tabular-nums">
                {start}
              </span>
            )}
            {busy && (
              <span className="text-[10px] text-white/30 animate-pulse">
                Saving…
              </span>
            )}
          </div>
        </div>

        {/* ── Markets — 3 col grid ── */}
        <div className="grid grid-cols-3 divide-x divide-white/5">
          {/* Spread / Handicap */}
          <div className="px-3 py-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">
              Spread
            </div>
            {typeof awayLine === "number" || typeof homeLine === "number" ? (
              <div className="space-y-1.5">
                <button
                  disabled={
                    closed || !gameKeySafe || typeof awayLine !== "number"
                  }
                  onClick={() =>
                    savePick({
                      g,
                      market: "spread",
                      pick: "away",
                      line: awayLine,
                      selection: "AWAY",
                    })
                  }
                  className={pickCell(
                    pickSpread?.pick === "away",
                    closed || !gameKeySafe || typeof awayLine !== "number",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">
                      {awayAbbr}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white/55">
                        {showLine(awayLine)}
                      </span>
                      {resultDot(
                        pickSpread?.pick === "away" ? pickSpread : null,
                      )}
                    </div>
                  </div>
                </button>
                <button
                  disabled={
                    closed || !gameKeySafe || typeof homeLine !== "number"
                  }
                  onClick={() =>
                    savePick({
                      g,
                      market: "spread",
                      pick: "home",
                      line: homeLine,
                      selection: "HOME",
                    })
                  }
                  className={pickCell(
                    pickSpread?.pick === "home",
                    closed || !gameKeySafe || typeof homeLine !== "number",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">
                      {homeAbbr}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white/55">
                        {showLine(homeLine)}
                      </span>
                      {resultDot(
                        pickSpread?.pick === "home" ? pickSpread : null,
                      )}
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center py-4">
                <span className="text-[11px] text-white/20">No line yet</span>
              </div>
            )}
          </div>

          {/* Total O/U */}
          <div className="px-3 py-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">
              Over / Under
            </div>
            {typeof totalLine === "number" ? (
              <div className="space-y-1.5">
                <button
                  disabled={closed || !gameKeySafe}
                  onClick={() =>
                    savePick({
                      g,
                      market: "ou",
                      pick: "over",
                      line: totalLine,
                      selection: "OVER",
                    })
                  }
                  className={pickCell(
                    pickOU?.pick === "over",
                    closed || !gameKeySafe,
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Over</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white/55">
                        O {totalLine}
                      </span>
                      {resultDot(pickOU?.pick === "over" ? pickOU : null)}
                    </div>
                  </div>
                </button>
                <button
                  disabled={closed || !gameKeySafe}
                  onClick={() =>
                    savePick({
                      g,
                      market: "ou",
                      pick: "under",
                      line: totalLine,
                      selection: "UNDER",
                    })
                  }
                  className={pickCell(
                    pickOU?.pick === "under",
                    closed || !gameKeySafe,
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">Under</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white/55">
                        U {totalLine}
                      </span>
                      {resultDot(pickOU?.pick === "under" ? pickOU : null)}
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center py-4">
                <span className="text-[11px] text-white/20">No line yet</span>
              </div>
            )}
          </div>

          {/* Moneyline */}
          <div className="px-3 py-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-2">
              Moneyline
            </div>
            <div className="space-y-1.5">
              <button
                disabled={closed || !gameKeySafe}
                onClick={() =>
                  savePick({
                    g,
                    market: "moneyline",
                    pick: "away",
                    line: null,
                    selection: "AWAY",
                  })
                }
                className={pickCell(mlAwayActive, closed || !gameKeySafe)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">
                    {awayAbbr}
                  </span>
                  {resultDot(mlAwayActive ? pickML : null)}
                </div>
              </button>
              <button
                disabled={closed || !gameKeySafe}
                onClick={() =>
                  savePick({
                    g,
                    market: "moneyline",
                    pick: "home",
                    line: null,
                    selection: "HOME",
                  })
                }
                className={pickCell(mlHomeActive, closed || !gameKeySafe)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">
                    {homeAbbr}
                  </span>
                  {resultDot(mlHomeActive ? pickML : null)}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ── Open / Locked badge row ── */}
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-2">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest",
              isFinal
                ? "border-emerald-500/20 bg-emerald-500/6 text-emerald-400"
                : isLive
                  ? "border-amber-400/20 bg-amber-500/6 text-amber-400"
                  : closed
                    ? "border-red-400/20 bg-red-500/6 text-red-400"
                    : "border-emerald-400/20 bg-emerald-500/6 text-emerald-400",
            ].join(" ")}
          >
            {isFinal
              ? "Final"
              : isLive
                ? "🔴 In Progress"
                : closed
                  ? "Locked"
                  : "✓ Open"}
          </span>
          {busy && (
            <span className="text-[10px] text-white/25 animate-pulse">
              Saving…
            </span>
          )}
        </div>

        {/* ── Player Props (Premium only) ── */}
        {isPremium && (pitchers.length > 0 || batters.length > 0) && (
          <div className="border-t border-white/5 px-4 pt-3 pb-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                Player Props
              </span>
            </div>

            {/* Pitcher + Batter side by side — like MLB Props page */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[...pitchers, ...batters].map((p: PlayerProp) => {
                const isPitcher = p.playerRole === "pitcher";
                const pk = `${gameKey}:${p.playerId}:${p.market}`;
                const cur = propPickMap.get(pk);
                const accentColor = isPitcher
                  ? "text-sky-400"
                  : "text-amber-400";
                const accentBorder = isPitcher
                  ? "border-sky-500/20 bg-sky-500/8"
                  : "border-amber-500/20 bg-amber-500/8";
                const btnColor = isPitcher ? "sky" : "amber";
                return (
                  <div
                    key={p.playerId}
                    className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]"
                  >
                    {/* Player header */}
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-sm ${accentBorder}`}
                        >
                          {isPitcher ? "⚾" : "🏏"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white leading-tight truncate">
                            {p.playerName}
                          </div>
                          <div className="text-[10px] text-white/30 truncate">
                            {p.team}
                          </div>
                        </div>
                      </div>
                      <div className="ml-3 flex-shrink-0 text-right">
                        <div className="text-[9px] uppercase tracking-widest text-white/20">
                          {PROP_LABEL[p.market] ?? p.market}
                        </div>
                        <div className={`text-base font-black ${accentColor}`}>
                          {p.line}
                        </div>
                      </div>
                    </div>

                    {/* Over / Under buttons */}
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      {(["over", "under"] as const).map((side) => {
                        const active = cur?.pick === side;
                        const disabledBtn = !isPremium;
                        return (
                          <button
                            key={side}
                            disabled={disabledBtn}
                            onClick={() => handlePropPick(p, side)}
                            className={[
                              "rounded-xl border py-2.5 px-3 text-center transition-all duration-150 select-none",
                              disabledBtn
                                ? "border-white/6 bg-white/[0.02] opacity-30 cursor-not-allowed"
                                : active
                                  ? isPitcher
                                    ? "border-sky-400/50 bg-sky-500/12 text-sky-100 ring-1 ring-sky-500/20"
                                    : "border-amber-400/50 bg-amber-500/12 text-amber-100 ring-1 ring-amber-500/20"
                                  : "border-white/8 bg-white/[0.03] text-white/65 hover:bg-white/[0.07] hover:border-white/15 hover:text-white/90",
                            ].join(" ")}
                          >
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
                              {side}
                            </div>
                            <div className="text-sm font-black">
                              {side === "over" ? "O" : "U"} {p.line}
                            </div>
                            {active &&
                              cur?.result &&
                              cur.result !== "pending" && (
                                <div
                                  className={`mt-1 text-[9px] font-bold ${cur.result === "win" ? "text-emerald-400" : cur.result === "loss" ? "text-red-400" : "text-amber-400"}`}
                                >
                                  {cur.result === "win"
                                    ? "✓ Win"
                                    : cur.result === "loss"
                                      ? "✗ Loss"
                                      : "~ Push"}
                                </div>
                              )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Premium upsell if not premium and props exist */}
        {!isPremium && (pitchers.length > 0 || batters.length > 0) && (
          <div className="flex items-center gap-3 border-t border-white/5 px-4 py-2.5">
            <span className="text-[10px] text-white/25">
              ⚾ Player props available
            </span>
            <a
              href="/subscription"
              className="rounded-lg border border-amber-400/25 bg-amber-500/8 px-2.5 py-1 text-[10px] font-bold text-amber-400 hover:bg-amber-500/15 transition"
            >
              ✦ Upgrade to unlock
            </a>
          </div>
        )}
      </div>
    );
  };

  function SectionHeader({
    label,
    count,
    live = false,
  }: {
    label: string;
    count: number;
    live?: boolean;
  }) {
    return (
      <div className="flex items-center justify-between py-2 mb-2">
        <div className="flex items-center gap-2">
          {live && (
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          )}
          <span
            className={`text-xs font-black uppercase tracking-widest ${live ? "text-red-400" : "text-white/30"}`}
          >
            {label}
          </span>
        </div>
        <span className="text-[10px] text-white/20">
          {count} game{count !== 1 ? "s" : ""}
        </span>
      </div>
    );
  }

  return (
    <Protected>
      <div className="px-4 md:px-6 py-6">
        <div className="mx-auto max-w-5xl">
          {/* ── Header ── */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                  ⚾ MLB Tournament
                </h1>
                {myPicks.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-500/8 px-2.5 py-0.5 text-[10px] font-bold text-sky-400">
                    {myPicks.length} picks
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/25">
                <span>{weekId}</span>
                <span className="text-white/10">·</span>
                <span>{weekLabel}</span>
                <span className="text-white/10">·</span>
                <span>{sectioned.total} games</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search teams…"
                className="w-44 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/15"
              />
              <div className="flex rounded-xl border border-white/8 bg-white/[0.02] p-0.5">
                {(
                  ["all", "scheduled", "inprogress", "final"] as StatusTab[]
                ).map((k) => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    className={[
                      "rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition",
                      statusFilter === k
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/55",
                    ].join(" ")}
                  >
                    {k === "all"
                      ? "All"
                      : k === "inprogress"
                        ? "Live"
                        : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {err && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
              {err}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
              {notice}
            </div>
          )}

          {/* ── Column headers ── */}
          <div className="mb-2 grid grid-cols-3 gap-0 pr-0">
            <div className="pl-4 text-[9px] font-black uppercase tracking-widest text-white/15" />
            <div className="grid grid-cols-3 divide-x divide-transparent">
              <div className="px-3 text-[9px] font-black uppercase tracking-widest text-white/15">
                Spread
              </div>
              <div className="px-3 text-[9px] font-black uppercase tracking-widest text-white/15">
                O/U
              </div>
              <div className="px-3 text-[9px] font-black uppercase tracking-widest text-white/15">
                Moneyline
              </div>
            </div>
          </div>

          {/* ── Game list ── */}
          {sectioned.mode === "flat" ? (
            <div className="space-y-2">
              {sectioned.rows.map((g, idx) => renderGame(g, idx))}
            </div>
          ) : (
            <div className="space-y-6">
              {sectioned.live.length > 0 && (
                <div>
                  <SectionHeader
                    label="Live"
                    count={sectioned.live.length}
                    live
                  />
                  <div className="space-y-2">
                    {sectioned.live.map((g, idx) => renderGame(g, idx))}
                  </div>
                </div>
              )}

              <div>
                <SectionHeader label="Today" count={sectioned.today.length} />
                {sectioned.today.length === 0 ? (
                  <div className="rounded-xl border border-white/6 bg-white/[0.02] py-8 text-center text-sm text-white/25">
                    No games today.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sectioned.today.map((g, idx) => renderGame(g, idx))}
                  </div>
                )}
              </div>

              {sectioned.upcoming.length > 0 && (
                <div>
                  <div className="flex items-center justify-between py-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-widest text-white/30">
                        Upcoming
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/20">
                        {sectioned.upcoming.length} game
                        {sectioned.upcoming.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() => setShowUpcoming((v) => !v)}
                        className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-1 text-[10px] font-bold text-white/40 hover:bg-white/[0.06] transition"
                      >
                        {showUpcoming ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                  {showUpcoming && (
                    <div className="space-y-2">
                      {sectioned.upcoming.map((g, idx) => renderGame(g, idx))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 text-[10px] text-white/15">
            Win +100 pts · Push +50 pts · Loss 0 pts · Picks lock at first pitch
          </div>
        </div>
      </div>
    </Protected>
  );
}
