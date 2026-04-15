"use client";

import { listenMyPicksByWeekAndSport } from "@/lib/firestore-picks";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { listenGamesByWeekAndSport, type GameDoc } from "@/lib/firestore-games";
import type { PickDoc } from "@/lib/firestore-picks";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

type StatusTab = "all" | "scheduled" | "inprogress" | "final";
type MarketTab = "all" | "moneyline" | "spread" | "ou";

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
  if (disabled) {
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  }

  return [
    "rounded-2xl border px-3 py-3 text-left transition",
    active
      ? "border-blue-400/70 bg-blue-500/15 text-white shadow-[0_0_0_1px_rgba(59,130,246,.35),0_0_28px_rgba(59,130,246,.22)]"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
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
  const safeCode = String(code || "").trim().toUpperCase();
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
          String(g.homeTeam ?? "").toLowerCase().includes(qq) ||
          String(g.awayTeam ?? "").toLowerCase().includes(qq),
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
      g.startTime?.toMillis?.() ??
      g.startTime?.toDate?.()?.getTime?.() ??
      0;

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

    const showMoneyline = market === "moneyline" || market === "all";
    const showSpread = market === "spread" || market === "all";
    const showOU = market === "ou" || market === "all";

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

    return (
      <div
        key={key}
        className="rounded-2xl border border-white/10 bg-black/20 p-4"
      >
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold">
              {g.awayTeam} <span className="text-white/40">@</span> {g.homeTeam}
            </div>

            <div className="mt-1 text-sm text-white/80">{scoreText(g)}</div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
              <span className={badgeBase()}>
                Status: <span className="text-white/80">{effective}</span>
              </span>

              {start ? <span className={badgeBase()}>{start}</span> : null}

              {effective === "final" ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                  Final
                </span>
              ) : effective === "inprogress" ? (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                  Locked
                </span>
              ) : closed ? (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                  Locked
                </span>
              ) : (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Open
                </span>
              )}

              {!gameKey ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                  Bad gameId
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-xs text-white/60">
            <div>
              ML:{" "}
              <span className="text-white/80">
                {mlPicked === awayAbbr
                  ? g.awayTeam
                  : mlPicked === homeAbbr
                    ? g.homeTeam
                    : (pickML as any)?.pick
                      ? (pickML as any).pick === "home"
                        ? g.homeTeam
                        : g.awayTeam
                      : "—"}
              </span>
            </div>
            <div>
              SP:{" "}
              <span className="text-white/80">
                {pickSpread?.pick
                  ? pickSpread.pick === "home"
                    ? `${g.homeTeam} ${showLine(homeLine)}`
                    : `${g.awayTeam} ${showLine(awayLine)}`
                  : "—"}
              </span>
            </div>
            <div>
              O/U:{" "}
              <span className="text-white/80">
                {pickOU?.pick
                  ? `${pickOU.pick === "over" ? "Over" : "Under"} ${showLine(totalLine, false)}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* DraftKings-style layout */}
        <div className="mt-3 space-y-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1.5 mb-1.5 px-1">
            <div />
            {showSpread ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Spread</div> : null}
            {showOU ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Total</div> : null}
            {showMoneyline ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Moneyline</div> : null}
          </div>

          {/* Away row */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1.5 items-center">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo code={awayAbbr} size={32} />
              <span className="truncate text-sm font-semibold text-white">{awayAbbr}</span>
            </div>

            {showSpread ? (
              <button
                className={pickCell(pickSpread?.pick === "away", closed || !gameKeySafe || typeof awayLine !== "number")}
                disabled={closed || !gameKeySafe || typeof awayLine !== "number"}
                onClick={() => savePick({ g, market: "spread", pick: "away", line: awayLine, selection: "AWAY" })}
              >
                <div className="text-center text-sm font-bold">{typeof awayLine === "number" ? showLine(awayLine) : "—"}</div>
              </button>
            ) : null}

            {showOU ? (
              <button
                className={pickCell(pickOU?.pick === "over", closed || !gameKeySafe || typeof totalLine !== "number")}
                disabled={closed || !gameKeySafe || typeof totalLine !== "number"}
                onClick={() => savePick({ g, market: "ou", pick: "over", line: totalLine, selection: "OVER" })}
              >
                <div className="text-center text-sm font-bold">{typeof totalLine === "number" ? `O ${totalLine}` : "—"}</div>
              </button>
            ) : null}

            {showMoneyline ? (
              <button
                className={pickCell(mlAwayActive, closed || !gameKeySafe)}
                disabled={closed || !gameKeySafe}
                onClick={() => savePick({ g, market: "moneyline", pick: "away", line: null, selection: "AWAY" })}
              >
                <div className="text-center text-sm font-bold">{awayAbbr}</div>
              </button>
            ) : null}
          </div>

          {/* Home row */}
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1.5 items-center mt-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo code={homeAbbr} size={32} />
              <span className="truncate text-sm font-semibold text-white">{homeAbbr}</span>
            </div>

            {showSpread ? (
              <button
                className={pickCell(pickSpread?.pick === "home", closed || !gameKeySafe || typeof homeLine !== "number")}
                disabled={closed || !gameKeySafe || typeof homeLine !== "number"}
                onClick={() => savePick({ g, market: "spread", pick: "home", line: homeLine, selection: "HOME" })}
              >
                <div className="text-center text-sm font-bold">{typeof homeLine === "number" ? showLine(homeLine) : "—"}</div>
              </button>
            ) : null}

            {showOU ? (
              <button
                className={pickCell(pickOU?.pick === "under", closed || !gameKeySafe || typeof totalLine !== "number")}
                disabled={closed || !gameKeySafe || typeof totalLine !== "number"}
                onClick={() => savePick({ g, market: "ou", pick: "under", line: totalLine, selection: "UNDER" })}
              >
                <div className="text-center text-sm font-bold">{typeof totalLine === "number" ? `U ${totalLine}` : "—"}</div>
              </button>
            ) : null}

            {showMoneyline ? (
              <button
                className={pickCell(mlHomeActive, closed || !gameKeySafe)}
                disabled={closed || !gameKeySafe}
                onClick={() => savePick({ g, market: "moneyline", pick: "home", line: null, selection: "HOME" })}
              >
                <div className="text-center text-sm font-bold">{homeAbbr}</div>
              </button>
            ) : null}
          </div>
        </div>

        {savingKey && gameKeySafe && savingKey.startsWith(`${gameKeySafe}:`) ? (
          <div className="mt-3 text-xs text-white/50">Saving…</div>
        ) : null}
      </div>
    );
  };

  return (
    <Protected>
      <div className="px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">
                  MLB Tournament
                </h1>
                <span className={badgeBase()}>Week {weekId}</span>
                <span className={badgeBase()}>{weekLabel}</span>
                <span className={badgeBase()}>
                  Picks: <span className="text-white/80">{myPicks.length}</span>
                </span>
                <span className={badgeBase()}>
                  View:{" "}
                  <span className="text-white/80">{marketLabel(market)}</span>
                </span>
              </div>

              <p className="mt-2 text-white/60">
                Picks lock automatically at first pitch. Points update when
                games go <span className="text-white/80">FINAL</span>.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search teams…"
                className="w-full sm:w-64 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              />

              <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
                {(
                  ["all", "scheduled", "inprogress", "final"] as StatusTab[]
                ).map((k) => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    className={[
                      "rounded-lg px-3 py-1 transition",
                      statusFilter === k
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:text-white",
                    ].join(" ")}
                  >
                    {k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {err ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}

          {notice ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {notice}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/70">{sectioned.total} game(s)</div>

            <div className="mt-4">
              {sectioned.mode === "flat" ? (
                sectioned.rows.map((g, idx) => renderGame(g, idx))
              ) : (
                <>
                  {sectioned.live.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          <div className="text-sm font-semibold text-white/90">
                            LIVE
                          </div>
                        </div>
                        <div className="text-xs text-white/50">
                          {sectioned.live.length} game(s)
                        </div>
                      </div>
                      <div className="space-y-3">
                        {sectioned.live.map((g, idx) => renderGame(g, idx))}
                      </div>
                    </div>
                  )}

                  <div className="mb-2">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white/90">
                        Today
                      </div>
                      <div className="text-xs text-white/50">
                        {sectioned.today.length} game(s)
                      </div>
                    </div>

                    {sectioned.today.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                        No games today.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sectioned.today.map((g, idx) => renderGame(g, idx))}
                      </div>
                    )}
                  </div>

                  {sectioned.upcoming.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white/90">
                          Upcoming
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-white/50">
                            {sectioned.upcoming.length} game(s)
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowUpcoming((v) => !v)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          >
                            {showUpcoming ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      {showUpcoming && (
                        <div className="space-y-3">
                          {sectioned.upcoming.map((g, idx) =>
                            renderGame(g, idx),
                          )}
                        </div>
                      )}
                    </div>
                  )}


                </>
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-white/50">
            Scoring: Win 100 • Loss 0 • Push 50.
          </div>
        </div>
      </div>
    </Protected>
  );
}