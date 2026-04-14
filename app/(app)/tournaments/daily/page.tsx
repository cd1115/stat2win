"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getDayId, getDayLabel } from "@/lib/day";
import { getWeekId } from "@/lib/week";
import { listenGamesByDay, ACTIVE_SPORTS } from "@/lib/firestore-games-daily";
import type { GameDoc, Sport } from "@/lib/firestore-games-daily";
import {
  listenMyDailyPicksByDay,
  type DailyPickDoc,
  type Market,
  type PickSide,
} from "@/lib/firestore-picks-daily";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── helpers ────────────────────────────────────────────────────────────────

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

function isClosed(g: GameDoc) {
  return g.status === "inprogress" || g.status === "final";
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

function stableGameKey(g: any): string {
  const candidates = [g?.gameId, g?.matchKey, g?.oddsEventId, g?.id];
  for (const c of candidates) {
    const x =
      typeof c === "string" ? c.trim() : typeof c === "number" ? String(c) : "";
    if (x && !isEpochMs13(x)) return x;
  }
  return "";
}

// ─── FIX #2: Expanded spread/total parsing to support more API structures ───
function getSpread(g: any) {
  // Try all common structures returned by different odds APIs
  const sp =
    g?.markets?.spread ??
    g?.markets?.sp ??
    g?.markets?.spreads ??
    g?.spread ??
    g?.spreads ??
    g?.lines?.spread ??
    null;

  let homeLine: number | null = null;
  let awayLine: number | null = null;

  if (sp) {
    // Structure: { homeLine, awayLine }
    if (typeof sp.homeLine === "number") homeLine = sp.homeLine;
    if (typeof sp.awayLine === "number") awayLine = sp.awayLine;

    // Structure: { line } (single value, home perspective)
    if (homeLine === null && typeof sp.line === "number") homeLine = sp.line;

    // Structure: { home: { line }, away: { line } }
    if (homeLine === null && typeof sp.home?.line === "number")
      homeLine = sp.home.line;
    if (awayLine === null && typeof sp.away?.line === "number")
      awayLine = sp.away.line;

    // Structure: array [{ team, line }, ...]
    if (Array.isArray(sp)) {
      for (const entry of sp) {
        if (entry?.team === "home" && typeof entry?.line === "number")
          homeLine = entry.line;
        if (entry?.team === "away" && typeof entry?.line === "number")
          awayLine = entry.line;
        // Some APIs use point or handicap instead of line
        if (entry?.team === "home" && typeof entry?.point === "number")
          homeLine = entry.point;
        if (entry?.team === "away" && typeof entry?.point === "number")
          awayLine = entry.point;
      }
    }
  }

  // Derive the missing side (they're always mirror images: -1.5 / +1.5)
  if (homeLine !== null && awayLine === null) awayLine = -homeLine;
  if (awayLine !== null && homeLine === null) homeLine = -awayLine;

  return { homeLine, awayLine };
}

function getTotal(g: any) {
  // Try all common structures
  const t =
    g?.markets?.total ??
    g?.markets?.ou ??
    g?.markets?.overUnder ??
    g?.markets?.over_under ??
    g?.total ??
    g?.overUnder ??
    g?.lines?.total ??
    null;

  let line: number | null = null;

  if (t) {
    if (typeof t.line === "number") line = t.line;
    else if (typeof t.total === "number") line = t.total;
    else if (typeof t.value === "number") line = t.value;
    else if (typeof t.point === "number") line = t.point;
    // Structure: { over: { line }, under: { line } } — both sides share the same number
    else if (typeof t.over?.line === "number") line = t.over.line;
    // Structure: array [{ name: "over", price, point }, ...]
    else if (Array.isArray(t)) {
      for (const entry of t) {
        if (
          (entry?.name === "over" || entry?.type === "over") &&
          typeof entry?.point === "number"
        ) {
          line = entry.point;
          break;
        }
        if (typeof entry?.line === "number") {
          line = entry.line;
          break;
        }
      }
    }
  }

  return { line };
}

function showLine(n: number | null, prefixPlus = true) {
  if (typeof n !== "number") return "—";
  if (n > 0 && prefixPlus) return `+${n}`;
  return `${n}`;
}

function badgeBase() {
  return "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70";
}

function sportChip(active: boolean) {
  return [
    "rounded-xl border px-3 py-2 text-sm transition",
    active
      ? "border-white/20 bg-white/10 text-white"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
  ].join(" ");
}

function pickCell(active: boolean, disabled: boolean) {
  if (disabled)
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  return [
    "rounded-2xl border px-4 py-4 md:px-3 md:py-3 text-left transition",
    active
      ? "border-blue-400/70 bg-blue-500/15 text-white shadow-[0_0_0_1px_rgba(59,130,246,.35),0_0_28px_rgba(59,130,246,.22)]"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
  ].join(" ");
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

function teamAbbrFrom(g: any, side: "home" | "away") {
  const explicit =
    side === "home"
      ? (g?.homeTeamAbbr ?? g?.homeAbbr ?? g?.teams?.homeAbbr)
      : (g?.awayTeamAbbr ?? g?.awayAbbr ?? g?.teams?.awayAbbr);
  const name = side === "home" ? g?.homeTeam : g?.awayTeam;
  const fromName =
    typeof name === "string" && name.trim()
      ? name.trim().slice(0, 3).toUpperCase()
      : "";
  const v =
    typeof explicit === "string" && explicit.trim()
      ? explicit.trim().toUpperCase()
      : fromName;
  return v || (side === "home" ? "HOME" : "AWAY");
}

const SPORT_LOGO_PATH: Record<Sport, string> = {
  NBA: "/teams",
  MLB: "/teams/mlb",
  NFL: "/teams",
  SOCCER: "/teams",
};

function TeamLogo({
  sport,
  code,
  size = 40,
}: {
  sport: Sport;
  code: string;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const safeCode = String(code || "")
    .trim()
    .toUpperCase();
  const basePath = SPORT_LOGO_PATH[sport] ?? "/teams";
  const src = `${basePath}/${safeCode}.png`;

  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
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

const SPORT_LABELS: Record<Sport, string> = {
  NBA: "NBA",
  MLB: "MLB",
  NFL: "NFL",
  SOCCER: "Soccer",
};

// ─── component ───────────────────────────────────────────────────────────────

type OptimisticPick = Partial<DailyPickDoc> & {
  market: Market;
  pick: PickSide;
};

export default function DailyTournamentPage() {
  const { user } = useAuth();

  const dayId = useMemo(() => getDayId(), []);
  const weekId = useMemo(() => getWeekId(), []);
  const dayLabel = useMemo(() => getDayLabel(dayId, "es-PR"), [dayId]);

  const searchParams = useSearchParams();
  const urlSport = searchParams.get("sport")?.toUpperCase() ?? "all";
  const isMixedPremium = urlSport === "MIXED";

  // Check if user has premium plan
  const [userPlan, setUserPlan] = useState<string>("free");
  useEffect(() => {
    if (!user?.uid) return;
    import("firebase/firestore").then(({ doc, getDoc }) => {
      import("@/lib/firebase").then(({ db }) => {
        getDoc(doc(db, "users", user.uid)).then((snap) => {
          if (snap.exists()) setUserPlan((snap.data() as any)?.plan ?? "free");
        });
      });
    });
  }, [user?.uid]);

  const isPremiumUser = userPlan === "premium";

  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPicks, setMyPicks] = useState<DailyPickDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [q, setQ] = useState("");
  const initialFilter: Sport | "all" =
    urlSport === "NBA" || urlSport === "MLB" ? (urlSport as Sport) : "all";
  const [sportFilter, setSportFilter] = useState<Sport | "all">(initialFilter);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [optimisticPicks, setOptimisticPicks] = useState<
    Record<string, OptimisticPick>
  >({});

  const placeDailyPickFn = useMemo(
    () => httpsCallable(functions, "placeDailyPick"),
    [],
  );
  const joinDailyTournamentFn = useMemo(
    () => httpsCallable(functions, "joinDailyTournament"),
    [],
  );

  // ── Tournament registration state ──
  // "unknown" = not checked yet, "registered" = joined, "unregistered" = not joined, "closed" = too late
  const [regStatus, setRegStatus] = useState<
    "unknown" | "registered" | "unregistered" | "closed"
  >("unknown");
  const [regLoading, setRegLoading] = useState(false);
  const [firstGameAt, setFirstGameAt] = useState<Date | null>(null);

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

  // Listen to today's games across all sports
  useEffect(() => {
    setErr(null);
    const unsub = listenGamesByDay(
      weekId,
      dayId,
      (rows) => setGames(rows),
      (e) => setErr(String((e as any)?.message ?? e)),
    );
    return () => unsub?.();
  }, [weekId, dayId]);

  // ── Check tournament registration status ──
  useEffect(() => {
    if (!user?.uid || !dayId || !weekId) return;
    const sport = urlSport === "MLB" ? "MLB" : "NBA";
    if (urlSport === "MIXED" || urlSport === "ALL" || urlSport === "all")
      return; // mixed handled separately

    let cancelled = false;
    async function checkReg() {
      try {
        const fn = httpsCallable(functions, "getTournamentStatus");
        const res: any = await fn({ sport, dayId, weekId, type: "daily" });
        if (cancelled) return;
        const data = res?.data ?? {};
        if (data.isRegistered) {
          setRegStatus("registered");
        } else if (!data.isOpen) {
          setRegStatus("closed");
        } else {
          setRegStatus("unregistered");
        }
        if (data.firstGameAt) setFirstGameAt(new Date(data.firstGameAt));
      } catch {
        if (!cancelled) setRegStatus("unregistered");
      }
    }
    checkReg();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, dayId, weekId, urlSport]);

  // ── Join tournament handler ──
  async function handleJoin() {
    if (!user?.uid) return;
    const sport = urlSport === "MLB" ? "MLB" : "NBA";
    setRegLoading(true);
    try {
      await joinDailyTournamentFn({ sport, dayId, weekId });
      setRegStatus("registered");
      pushNotice("✓ ¡Te uniste al torneo! Ya puedes hacer tus picks.");
    } catch (e: any) {
      const msg = e?.message ?? "No se pudo unir al torneo.";
      if (msg.includes("closed") || msg.includes("started")) {
        setRegStatus("closed");
        pushNotice("El torneo ya está cerrado — el primer juego ya comenzó.");
      } else {
        pushNotice(`Error: ${msg}`);
      }
    } finally {
      setRegLoading(false);
    }
  }

  // Listen to my daily picks
  useEffect(() => {
    setErr(null);
    if (!user?.uid) {
      setMyPicks([]);
      return;
    }
    const unsub = listenMyDailyPicksByDay(
      user.uid,
      dayId,
      (rows) => setMyPicks(rows),
      (e) => setErr(String((e as any)?.message ?? e)),
    );
    return () => unsub?.();
  }, [user?.uid, dayId]);

  // ─── FIX #1: Expanded pickMap to match all possible ID fields saved by the Cloud Function ───
  const pickMap = useMemo(() => {
    const m = new Map<string, DailyPickDoc>();

    const put = (id: any, market: any, p: DailyPickDoc) => {
      if (!id || !market) return;
      const key = `${String(id).trim()}:${String(market).trim()}`;
      // Only store the first pick found for this key (don't overwrite)
      if (!m.has(key)) m.set(key, p);
    };

    for (const p of myPicks) {
      // Index by every possible ID field the Cloud Function might have stored
      put((p as any).gameId, (p as any).market, p);
      put((p as any).externalGameId, (p as any).market, p);
      put((p as any).gameDocId, (p as any).market, p);
      put((p as any).id, (p as any).market, p);
    }
    return m;
  }, [myPicks]);

  // ─── FIX #1b: Helper that checks all possible keys for a game ───
  const getPickForGame = (
    g: GameDoc,
    market: Market,
  ): DailyPickDoc | OptimisticPick | null => {
    const gameKey = stableGameKey(g);
    const docId = String(g.id);

    // Check optimistic first (most recent state)
    const opKey = gameKey ? `${gameKey}:${market}` : null;
    if (opKey && optimisticPicks[opKey])
      return optimisticPicks[opKey] as OptimisticPick;

    const opKeyDoc = `${docId}:${market}`;
    if (optimisticPicks[opKeyDoc])
      return optimisticPicks[opKeyDoc] as OptimisticPick;

    // Then check persisted picks map with all candidate IDs
    if (gameKey) {
      const fromMap = pickMap.get(`${gameKey}:${market}`);
      if (fromMap) return fromMap;
    }

    // Fallback: try with the Firestore doc ID
    const fromDocId = pickMap.get(`${docId}:${market}`);
    if (fromDocId) return fromDocId;

    return null;
  };

  // ── filtered games ──
  const filteredGames = useMemo(() => {
    let rows = [...games];
    if (sportFilter !== "all")
      rows = rows.filter((g) => g.sport === sportFilter);
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
    return rows.sort((a, b) => {
      const at = a.startTime?.toMillis?.() ?? 0;
      const bt = b.startTime?.toMillis?.() ?? 0;
      return at - bt;
    });
  }, [games, sportFilter, q]);

  // ── grouped by sport ──
  const bySport = useMemo(() => {
    const map = new Map<Sport, GameDoc[]>();
    for (const g of filteredGames) {
      if (!map.has(g.sport)) map.set(g.sport, []);
      map.get(g.sport)!.push(g);
    }
    return map;
  }, [filteredGames]);

  // ── save pick via Cloud Function ──
  async function savePick(args: {
    g: GameDoc;
    market: Market;
    pick: PickSide;
    line: number | null;
    selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  }) {
    if (!user?.uid) return;

    const gameKey = String(
      (args.g as any).gameId ?? stableGameKey(args.g) ?? "",
    ).trim();
    const gameKeySafe = gameKey || String(args.g.id);

    if (!gameKeySafe) {
      pushNotice("Este juego tiene un gameId inválido. No se puede pickear.");
      return;
    }

    if (isClosed(args.g)) return;

    const key = `${gameKeySafe}:${args.market}`;

    const existing = getPickForGame(args.g, args.market);

    const isSameChoice =
      existing &&
      ((existing as any).pick === args.pick ||
        (existing as any).selection?.toLowerCase() ===
          args.selection.toLowerCase());

    // ── ML + Spread conflict check ──
    if (!isSameChoice) {
      const conflictMarket =
        args.market === "moneyline"
          ? "spread"
          : args.market === "spread"
            ? "moneyline"
            : null;
      if (conflictMarket) {
        const hasConflict = getPickForGame(args.g, conflictMarket as Market);
        if (hasConflict) {
          const conflictLabel =
            conflictMarket === "spread" ? "Spread" : "Moneyline";
          pushNotice(
            `No puedes combinar Moneyline y Spread en el mismo juego. Quita el pick de ${conflictLabel} primero.`,
          );
          return;
        }
      }
    }

    if (isSameChoice) {
      // toggle off
      setSavingKey(key);
      setOptimisticPicks((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      try {
        await placeDailyPickFn({
          sport: args.g.sport,
          dayId,
          weekId,
          gameId: gameKeySafe,
          gameDocId: String(args.g.id),
          market: args.market,
          selection: args.selection.toLowerCase(),
          pick: args.pick,
          line: args.line ?? null,
          clear: true,
        });
        pushNotice("✓ Pick eliminado");
      } catch (e: any) {
        setOptimisticPicks((prev) => ({
          ...prev,
          [key]: {
            market: args.market,
            pick: args.pick,
            selection: args.selection,
            gameId: gameKeySafe,
          },
        }));
        pushNotice(`Error: ${formatCallableError(e)}`);
      } finally {
        setSavingKey(null);
      }
      return;
    }

    // optimistic update
    setOptimisticPicks((prev) => ({
      ...prev,
      [key]: {
        market: args.market,
        pick: args.pick,
        selection: args.selection,
        gameId: gameKeySafe,
      },
    }));

    setSavingKey(key);

    try {
      await placeDailyPickFn({
        sport: args.g.sport,
        dayId,
        weekId,
        gameId: gameKeySafe,
        gameDocId: String(args.g.id),
        market: args.market,
        selection: args.selection.toLowerCase(),
        pick: args.pick,
        line: args.line ?? null,
      });
      pushNotice("✓ Pick guardado");
    } catch (e: any) {
      setOptimisticPicks((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      pushNotice(`Error: ${formatCallableError(e)}`);
    } finally {
      setSavingKey(null);
    }
  }

  // ── render game ──
  const renderGame = (g: GameDoc) => {
    const gameKey = stableGameKey(g);
    const closed = isClosed(g);
    const sp = getSpread(g);
    const ou = getTotal(g);

    const hasSpreadLine = typeof sp.homeLine === "number";
    const hasTotalLine = typeof ou.line === "number";

    const pickML = getPickForGame(g, "moneyline");
    const pickSP = getPickForGame(g, "spread");
    const pickOU = getPickForGame(g, "ou");

    const isSaving = (market: Market) => savingKey === `${gameKey}:${market}`;
    const isSavingML = isSaving("moneyline");
    const isSavingSpread = isSaving("spread");
    const isSavingOU = isSaving("ou");

    const mlAwayActive =
      (pickML as any)?.pick === "away" ||
      (pickML as any)?.selection === teamAbbrFrom(g, "away");
    const mlHomeActive =
      (pickML as any)?.pick === "home" ||
      (pickML as any)?.selection === teamAbbrFrom(g, "home");

    return (
      <div
        key={g.id}
        className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-3"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/50">
                {g.sport}
              </span>
              <span className="text-base font-bold text-white">
                {g.awayTeam} @ {g.homeTeam}
              </span>
            </div>
            {typeof g.scoreAway === "number" &&
              typeof g.scoreHome === "number" && (
                <div className="mb-1 text-xs text-white/50">
                  {g.awayTeam} {g.scoreAway} • {g.homeTeam} {g.scoreHome}
                </div>
              )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60">
                Status: {g.status}
              </span>
              {g.startTime && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60">
                  {fmtStart(g.startTime)}
                </span>
              )}
              {!closed && (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  Open
                </span>
              )}
              {closed && g.status === "inprogress" && (
                <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
              )}
              {g.status === "final" && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/40">
                  Final
                </span>
              )}
            </div>
          </div>

          {/* Pick summary top-right */}
          <div className="text-right text-xs text-white/50 shrink-0">
            <div>
              ML:{" "}
              <span className="text-white/80">
                {pickML
                  ? (pickML as any).pick === "away"
                    ? g.awayTeam
                    : g.homeTeam
                  : "—"}
              </span>
            </div>
            <div>
              SP:{" "}
              <span className="text-white/80">
                {pickSP
                  ? (pickSP as any).pick === "away"
                    ? `${g.awayTeam} ${showLine(sp.awayLine)}`
                    : `${g.homeTeam} ${showLine(sp.homeLine)}`
                  : "—"}
              </span>
            </div>
            <div>
              O/U:{" "}
              <span className="text-white/80">
                {pickOU
                  ? (pickOU as any).pick === "over"
                    ? `O ${ou.line ?? "—"}`
                    : `U ${ou.line ?? "—"}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Picks grid — same layout as NBA: [team col] [spread] [total] [moneyline] */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-[1fr_180px_180px_160px]">
          {/* Column headers */}
          <div />
          <div className="text-xs font-semibold text-white/60">Handicap</div>
          <div className="text-xs font-semibold text-white/60">Total</div>
          <div className="text-xs font-semibold text-white/60">Moneyline</div>

          {/* Away row */}
          <div className="flex items-center gap-3">
            <TeamLogo
              sport={g.sport}
              code={teamAbbrFrom(g, "away")}
              size={40}
            />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">
                {g.awayTeam}
              </div>
            </div>
          </div>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !hasSpreadLine ||
              !gameKey ||
              isSavingSpread ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "spread",
                pick: "away",
                line: typeof sp.awayLine === "number" ? sp.awayLine : null,
                selection: "AWAY",
              })
            }
            className={pickCell(
              (pickSP as any)?.pick === "away",
              !user?.uid ||
                closed ||
                !hasSpreadLine ||
                !gameKey ||
                isSavingSpread,
            )}
          >
            <div className="text-base font-semibold">
              {g.awayTeam} {showLine(sp.awayLine)}
            </div>
          </button>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !hasTotalLine ||
              !gameKey ||
              isSavingOU ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "ou",
                pick: "over",
                line: typeof ou.line === "number" ? ou.line : null,
                selection: "OVER",
              })
            }
            className={pickCell(
              (pickOU as any)?.pick === "over",
              !user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU,
            )}
          >
            <div className="text-base font-semibold">O {ou.line ?? "—"}</div>
          </button>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !gameKey ||
              isSavingML ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "moneyline",
                pick: "away",
                line: null,
                selection: "AWAY",
              })
            }
            className={pickCell(
              mlAwayActive,
              !user?.uid || closed || !gameKey || isSavingML,
            )}
          >
            <div className="text-base font-semibold">{g.awayTeam}</div>
          </button>

          {/* Home row */}
          <div className="flex items-center gap-3">
            <TeamLogo
              sport={g.sport}
              code={teamAbbrFrom(g, "home")}
              size={40}
            />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">
                {g.homeTeam}
              </div>
            </div>
          </div>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !hasSpreadLine ||
              !gameKey ||
              isSavingSpread ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "spread",
                pick: "home",
                line: typeof sp.homeLine === "number" ? sp.homeLine : null,
                selection: "HOME",
              })
            }
            className={pickCell(
              (pickSP as any)?.pick === "home",
              !user?.uid ||
                closed ||
                !hasSpreadLine ||
                !gameKey ||
                isSavingSpread,
            )}
          >
            <div className="text-base font-semibold">
              {g.homeTeam} {showLine(sp.homeLine)}
            </div>
          </button>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !hasTotalLine ||
              !gameKey ||
              isSavingOU ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "ou",
                pick: "under",
                line: typeof ou.line === "number" ? ou.line : null,
                selection: "UNDER",
              })
            }
            className={pickCell(
              (pickOU as any)?.pick === "under",
              !user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU,
            )}
          >
            <div className="text-base font-semibold">U {ou.line ?? "—"}</div>
          </button>

          <button
            disabled={
              !user?.uid ||
              closed ||
              !gameKey ||
              isSavingML ||
              (regStatus !== "registered" && !isMixedPremium)
            }
            onClick={() =>
              savePick({
                g,
                market: "moneyline",
                pick: "home",
                line: null,
                selection: "HOME",
              })
            }
            className={pickCell(
              mlHomeActive,
              !user?.uid || closed || !gameKey || isSavingML,
            )}
          >
            <div className="text-base font-semibold">{g.homeTeam}</div>
          </button>
        </div>

        {(!hasSpreadLine || !hasTotalLine) && (
          <div className="mt-3 text-xs text-white/50">
            {!hasSpreadLine && <span>Spread: no line yet. </span>}
            {!hasTotalLine && <span>Total: no line yet.</span>}
          </div>
        )}
      </div>
    );
  };

  const sportsInGames = useMemo(
    () => Array.from(new Set(games.map((g) => g.sport))),
    [games],
  );

  return (
    <Protected>
      <div className="px-6 py-6">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl md:text-3xl font-bold tracking-tight">
                  {isMixedPremium
                    ? "Mixed Daily Tournament"
                    : sportFilter === "all"
                      ? "Daily Tournament"
                      : `${sportFilter} Daily Tournament`}
                </h1>
                <span className={badgeBase()}>{dayLabel}</span>
                <span className={badgeBase()}>
                  Picks: <span className="text-white/80">{myPicks.length}</span>
                </span>
                <span className={badgeBase()}>
                  Juegos:{" "}
                  <span className="text-white/80">{filteredGames.length}</span>
                </span>
              </div>
              <p className="mt-2 text-white/60">
                Picks se cierran al primer pitch / tip-off. Puntos actualizan
                cuando el juego va <span className="text-white/80">FINAL</span>.
              </p>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search teams..."
              className="w-full md:w-64 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
            />
          </div>

          {/* Sport filter chips — only show when not in a specific sport URL */}
          {!isMixedPremium && sportsInGames.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setSportFilter("all")}
                className={sportChip(sportFilter === "all")}
              >
                All
              </button>
              {sportsInGames.map((s) => (
                <button
                  key={s}
                  onClick={() => setSportFilter(s)}
                  className={sportChip(sportFilter === s)}
                >
                  {SPORT_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          )}

          {/* Errors / notices */}
          {err && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {notice}
            </div>
          )}

          {/* ── Tournament registration banner ── */}
          {!isMixedPremium && regStatus === "unregistered" && (
            <div className="mb-5 rounded-2xl border border-blue-400/25 bg-blue-500/8 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white mb-1">
                  Únete al torneo de hoy
                </div>
                <div className="text-xs text-white/55">
                  Regístrate antes del primer juego para poder hacer picks.
                  {firstGameAt && (
                    <span className="text-blue-300 ml-1">
                      Cierra:{" "}
                      {firstGameAt.toLocaleString(undefined, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleJoin}
                disabled={regLoading}
                className="flex-shrink-0 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition"
              >
                {regLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uniéndose…
                  </span>
                ) : (
                  "Join Tournament →"
                )}
              </button>
            </div>
          )}

          {!isMixedPremium && regStatus === "closed" && (
            <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/8 px-5 py-4 flex items-start gap-3">
              <span className="text-red-400 flex-shrink-0 mt-0.5">🔒</span>
              <div>
                <div className="text-sm font-semibold text-white">
                  Torneo cerrado para nuevos registros
                </div>
                <div className="text-xs text-white/50 mt-0.5">
                  El primer juego ya comenzó. Podrás unirte al torneo de mañana.
                </div>
              </div>
            </div>
          )}

          {!isMixedPremium && regStatus === "registered" && (
            <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-300">
              <span>✓</span>
              <span>Estás registrado en este torneo — tus picks cuentan.</span>
            </div>
          )}

          {/* Premium gate for Mixed */}
          {isMixedPremium && !isPremiumUser ? (
            <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
              <div className="text-4xl mb-4">⭐</div>
              <h2 className="text-xl font-bold text-amber-200 mb-2">
                Mixed Daily — Premium
              </h2>
              <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">
                El Mixed Daily Tournament combina NBA + MLB en un torneo
                especial exclusivo para suscriptores Premium.
              </p>
              <a
                href="/store"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-6 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/20"
              >
                Obtener Premium
                <span>→</span>
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              {filteredGames.length === 0 ? (
                <div className="py-12 text-center text-white/50">
                  No hay juegos programados para hoy.
                </div>
              ) : sportFilter === "all" ? (
                Array.from(bySport.entries()).map(([sport, sportGames]) => (
                  <div key={sport} className="mb-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm font-bold text-white/90">
                        {SPORT_LABELS[sport] ?? sport}
                      </span>
                      <span className="text-xs text-white/40">
                        {sportGames.length} game(s)
                      </span>
                    </div>
                    {sportGames.map((g) => renderGame(g))}
                  </div>
                ))
              ) : (
                filteredGames.map((g) => renderGame(g))
              )}
            </div>
          )}

          <div className="mt-4 text-xs text-white/50">
            Scoring: Win 100 • Loss 0 • Push 50 (push aplica a Spread / O-U
            cuando la línea exacta se cumple).
          </div>
        </div>
      </div>
    </Protected>
  );
}
