"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { listenMyPicksByWeekAndSport, type PickDoc } from "@/lib/firestore-picks";
import { listenGamesByWeekAndSport, type GameDoc } from "@/lib/firestore-games";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase"; // <- si tu proyecto exporta `functions` aquí

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

function isClosed(g: GameDoc) {
  return g.status === "inprogress" || g.status === "final";
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

/**
 * ✅ IDs estables con OddsAPI:
 * Preferimos gameId (si lo guardas), pero hacemos fallback seguro a matchKey / oddsEventId.
 * Bloqueamos timestamps de 13 dígitos (IDs basura).
 */
function stableGameKey(g: any): string {
  const candidates: Array<unknown> = [g?.gameId, g?.matchKey, g?.oddsEventId, g?.id];

  const norm = (v: unknown) => {
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  };

  for (const c of candidates) {
    const x = norm(c);
    if (!x) continue;
    if (isEpochMs13(x)) continue;
    return x;
  }
  return "";
}

function getSpread(g: any) {
  const sp = g?.markets?.spread ?? g?.markets?.sp ?? null;

  const homeLine =
    typeof sp?.line === "number"
      ? sp.line
      : typeof sp?.homeLine === "number"
        ? sp.homeLine
        : typeof sp?.home === "number"
          ? sp.home
          : typeof sp?.lineHome === "number"
            ? sp.lineHome
            : null;

  const awayLine =
    typeof sp?.awayLine === "number"
      ? sp.awayLine
      : typeof sp?.away === "number"
        ? sp.away
        : typeof sp?.lineAway === "number"
          ? sp.lineAway
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

/**
 * ✅ Azul glow Stat2Win (solo cambia el estilo cuando active=true)
 */
function pickCell(active: boolean, disabled: boolean) {
  if (disabled) {
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  }
  return [
    "rounded-2xl border px-4 py-4 md:px-3 md:py-3 text-left transition",
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

// ✅ mejor error para callable (incluye details si vienen)
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

// ✅ helper para team abbr (DAL/ORL etc.)
function teamAbbrFrom(g: any, side: "home" | "away") {
  const explicit =
    side === "home"
      ? g?.homeTeamAbbr ?? g?.homeAbbr ?? g?.teams?.homeAbbr
      : g?.awayTeamAbbr ?? g?.awayAbbr ?? g?.teams?.awayAbbr;

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

function TeamLogo({
  code,
  size = 40,
}: {
  code: string;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const safeCode = String(code || "").trim().toUpperCase();
  const src = `/teams/${safeCode}.png`;

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
type OptimisticPick = Partial<PickDoc> & {
  market: "moneyline" | "spread" | "ou";
  pick: "home" | "away" | "over" | "under";
};

export default function NbaTournamentPage() {
  const { user } = useAuth();
  const sport = "NBA" as const;

  const weekId = getWeekId(new Date());
  const weekLabel = getWeekRangeLabel(new Date(), "es-PR");

  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPicks, setMyPicks] = useState<PickDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  function pushNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3500);
  }

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [market, setMarket] = useState<MarketTab>("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showPast, setShowPast] = useState(false);

  /**
   * ✅ NUEVO: optimistic picks (para que el highlight se quede inmediato)
   * Key = `${gameKeySafe}:${market}`
   */
  const [optimisticPicks, setOptimisticPicks] = useState<Record<string, OptimisticPick>>({});

  // ✅ Callable estable (evita recrear en cada render)
  const placePickFn = useMemo(() => httpsCallable(functions, "placePick"), []);

  useEffect(() => {
    setErr(null);
    if (!weekId) return;

    const unsub = listenGamesByWeekAndSport(
      sport,
      weekId,
      (rows) => setGames(rows),
      (e) => setErr(String((e as any)?.message ?? e)),
    );

    return () => unsub?.();
  }, [sport, weekId]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setErr(null);

    if (!user?.uid || !weekId) {
      setMyPicks([]);
      return;
    }

    const unsub = listenMyPicksByWeekAndSport(user.uid, weekId, sport, (rows) =>
      setMyPicks(rows),
    );

    return () => unsub?.();
  }, [user?.uid, weekId, sport]);

  /**
   * ✅ FIX real para persistencia:
   * Algunas veces el pick puede venir guardado con gameId / externalGameId / gameDocId.
   * Creamos el map con ALIAS para que siempre matchee con el gameKeySafe del UI.
   */
  const pickMap = useMemo(() => {
    const m = new Map<string, PickDoc>();

    const put = (id: any, market: any, p: PickDoc) => {
      if (!id || !market) return;
      const key = `${String(id).trim()}:${String(market).trim()}`;
      if (!m.has(key)) m.set(key, p);
    };

    for (const p of myPicks) {
      // primary
      put((p as any).gameId, (p as any).market, p);

      // aliases (no rompen nada si no existen)
      put((p as any).externalGameId, (p as any).market, p);
      put((p as any).gameDocId, (p as any).market, p);
      put((p as any).id, (p as any).market, p);
    }

    return m;
  }, [myPicks]);

  const baseFilteredGames = useMemo(() => {
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
      rows = rows.filter((g) => (g.status ?? "").toLowerCase() === statusFilter);
    }

    return rows;
  }, [games, q, statusFilter]);

  // ✅ PRO sections: LIVE → Today → Upcoming → Final
  const sectioned = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const startMs = (g: GameDoc) => g.startTime?.toMillis?.() ?? 0;
    const startDate = (g: GameDoc) => new Date(startMs(g));

    if (statusFilter !== "all") {
      const rows = [...baseFilteredGames].sort((a, b) => startMs(a) - startMs(b));
      return { mode: "flat" as const, total: rows.length, rows };
    }

    const rows = [...baseFilteredGames];

    const live = rows
      .filter((g) => (g.status ?? "").toLowerCase() === "inprogress")
      .sort((a, b) => startMs(a) - startMs(b));

    const today = rows
      .filter((g) => {
        const s = (g.status ?? "").toLowerCase();
        if (s === "final") return false;
        const d = startDate(g);
        return d >= todayStart && d <= todayEnd && s !== "inprogress";
      })
      .sort((a, b) => startMs(a) - startMs(b));

    const upcoming = rows
      .filter((g) => {
        const s = (g.status ?? "").toLowerCase();
        if (s === "final" || s === "inprogress") return false;
        const d = startDate(g);
        return d > todayEnd;
      })
      .sort((a, b) => startMs(a) - startMs(b));

    const past = rows
      .filter((g) => {
        const s = (g.status ?? "").toLowerCase();
        const d = startDate(g);
        return d < todayStart || s === "final";
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
  }, [baseFilteredGames, statusFilter]);

  async function savePick(args: {
    g: GameDoc;
    market: "moneyline" | "spread" | "ou";
    pick: "home" | "away" | "over" | "under";
    line: number | null;
    selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  }) {
    if (!user?.uid) return;

    const gameKey = String((args.g as any).gameId ?? stableGameKey(args.g) ?? "").trim();
    const gameKeySafe = gameKey || String(args.g.id);

    if (!gameKeySafe) {
      pushNotice("Este juego tiene un gameId inválido (timestamp). No se puede pickear.");
      return;
    }

    if (isClosed(args.g)) return;

    const key = `${gameKeySafe}:${args.market}`;

    // ✅ buscamos el pick existente con la misma key que usa el UI
    const existing =
      (optimisticPicks[key] as any) ||
      pickMap.get(`${gameKeySafe}:${args.market}`) ||
      pickMap.get(`${gameKey}:${args.market}`) ||
      pickMap.get(`${String(args.g.id)}:${args.market}`);

    const selectionForMarket = (() => {
      if (args.market === "moneyline") {
        return args.pick === "home" ? teamAbbrFrom(args.g, "home") : teamAbbrFrom(args.g, "away");
      }
      return args.selection;
    })();

    const canonicalSelection = args.pick;
    const marketKey = args.market === "moneyline" ? "ml" : args.market === "spread" ? "sp" : "ou";

    const teamAbbr =
      args.market === "moneyline"
        ? args.pick === "home"
          ? teamAbbrFrom(args.g, "home")
          : teamAbbrFrom(args.g, "away")
        : null;

    // ✅ Toggle (clear pick)
    if (existing?.pick === args.pick) {
      setSavingKey(key);
      setErr(null);
      setNotice(null);

      // optimistic: quitar highlight inmediato
      setOptimisticPicks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const payload = {
          uid: user.uid,
          sport,
          sportKey: "nba",
          league: "nba",
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

        console.log("placePick (clear) payload =>", payload);
        await placePickFn(payload);
      } catch (e: any) {
        // rollback: si falla, devolvemos highlight al estado anterior
        setOptimisticPicks((prev) => ({
          ...prev,
          [key]: {
            market: args.market,
            pick: existing?.pick ?? canonicalSelection,
            ...(existing?.selectionForMarket ? { selectionForMarket: existing.selectionForMarket } : {}),
            ...(existing?.teamAbbr ? { teamAbbr: existing.teamAbbr } : {}),
          } as any,
        }));
        setErr(formatCallableError(e));
      } finally {
        setSavingKey(null);
      }
      return;
    }

    // ✅ No combinar ML y Spread
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

    // ✅ optimistic: marcar highlight inmediato (persistente)
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
        sportKey: "nba",
        league: "nba",
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

      console.log("placePick payload =>", payload);
      await placePickFn(payload);
    } catch (e: any) {
      // rollback optimistic si falla
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

  // ✅ One renderer: no duplicamos tu card. Solo la reusamos para cada sección.
  const renderGame = (g: GameDoc) => {
    const closed = isClosed(g);
    const start = fmtStart(g.startTime);

    const sp = getSpread(g as any);
    const ou = getTotal(g as any);

    const homeScore: number | null = (g as any).scoreHome ?? (g as any).homeScore ?? null;
    const awayScore: number | null = (g as any).scoreAway ?? (g as any).awayScore ?? null;
    const hasScore = typeof homeScore === "number" && typeof awayScore === "number";

    const gameKey = String((g as any).gameId ?? stableGameKey(g) ?? "").trim();
    const gameKeySafe = gameKey || String(g.id);

    const pickFor = (mk: "moneyline" | "spread" | "ou") => {
      const k = `${gameKeySafe}:${mk}`;
      return (
        (optimisticPicks[k] as any) ||
        pickMap.get(`${gameKeySafe}:${mk}`) ||
        pickMap.get(`${gameKey}:${mk}`) ||
        pickMap.get(`${String(g.id)}:${mk}`) ||
        null
      );
    };

    const pickML = pickFor("moneyline");
    const pickSP = pickFor("spread");
    const pickOU = pickFor("ou");

    const showMoneyline = market === "moneyline" || market === "all";
    const showSpread = market === "spread" || market === "all";
    const showOU = market === "ou" || market === "all";

    const hasSpreadLine = typeof sp.homeLine === "number" || typeof sp.awayLine === "number";
    const hasTotalLine = typeof ou.line === "number";

    const isSavingSpread = savingKey === `${gameKeySafe}:spread`;
    const isSavingOU = savingKey === `${gameKeySafe}:ou`;
    const isSavingML = savingKey === `${gameKeySafe}:moneyline`;

    const awayAbbr = teamAbbrFrom(g as any, "away");
    const homeAbbr = teamAbbrFrom(g as any, "home");

    const mlPicked = (pickML as any)?.selectionForMarket ?? (pickML as any)?.teamAbbr ?? null;

    const mlAwayActive = mlPicked === awayAbbr || (mlPicked == null && (pickML as any)?.pick === "away");
    const mlHomeActive = mlPicked === homeAbbr || (mlPicked == null && (pickML as any)?.pick === "home");

    const mlPickedLabel =
      mlPicked === awayAbbr
        ? g.awayTeam
        : mlPicked === homeAbbr
          ? g.homeTeam
          : (pickML as any)?.pick
            ? (pickML as any).pick === "home"
              ? g.homeTeam
              : g.awayTeam
            : "—";

    return (
      <div key={g.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold">
              {g.awayTeam} <span className="text-white/40">@</span> {g.homeTeam}
            </div>

            {hasScore && (
              <div className="mt-1 text-sm text-white/80">
                {g.awayTeam} {awayScore} <span className="text-white/40">•</span> {g.homeTeam} {homeScore}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
              <span className={badgeBase()}>
                Status: <span className="text-white/80">{g.status}</span>
              </span>
              {start ? <span className={badgeBase()}>{start}</span> : null}

              {closed ? (
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
              ML: <span className="text-white/80">{mlPickedLabel}</span>
            </div>
            <div>
              SP:{" "}
              <span className="text-white/80">
                {(pickSP as any)?.pick
                  ? (pickSP as any).pick === "home"
                    ? `${g.homeTeam} ${showLine(sp.homeLine)}`
                    : `${g.awayTeam} ${showLine(sp.awayLine)}`
                  : "—"}
              </span>
            </div>
            <div>
              O/U:{" "}
              <span className="text-white/80">
                {(pickOU as any)?.pick
                  ? (pickOU as any).pick === "over"
                    ? `Over ${ou.line ?? "—"}`
                    : `Under ${ou.line ?? "—"}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* DraftKings-style layout */}
        <div className="mt-3 space-y-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1.2fr_1fr_1.3fr_1fr] gap-1.5 mb-1.5 px-1">
            <div />
            {showSpread ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Spread</div> : null}
            {showOU ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Total</div> : null}
            {showMoneyline ? <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-white/40">Moneyline</div> : null}
          </div>

          {/* Away row */}
          <div className="grid grid-cols-[1.2fr_1fr_1.3fr_1fr] gap-1.5 items-center">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamLogo code={awayAbbr} size={28} />
              <span className="text-sm font-semibold text-white">{awayAbbr}</span>
            </div>

            {showSpread ? (
              <button
                disabled={!user?.uid || closed || !hasSpreadLine || !gameKey || isSavingSpread}
                onClick={() => savePick({ g, market: "spread", pick: "away", line: typeof sp.awayLine === "number" ? sp.awayLine : null, selection: "AWAY" })}
                className={pickCell((pickSP as any)?.pick === "away", !user?.uid || closed || !hasSpreadLine || !gameKey || isSavingSpread)}
              >
                <div className="text-center text-sm font-bold">{showLine(sp.awayLine)}</div>
              </button>
            ) : null}

            {showOU ? (
              <button
                disabled={!user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU}
                onClick={() => savePick({ g, market: "ou", pick: "over", line: typeof ou.line === "number" ? ou.line : null, selection: "OVER" })}
                className={pickCell((pickOU as any)?.pick === "over", !user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU)}
              >
                <div className="text-center text-xs font-bold whitespace-nowrap">O {ou.line ?? "—"}</div>
              </button>
            ) : null}

            {showMoneyline ? (
              <button
                disabled={!user?.uid || closed || !gameKey || isSavingML}
                onClick={() => savePick({ g, market: "moneyline", pick: "away", line: null, selection: "AWAY" })}
                className={pickCell(mlAwayActive, !user?.uid || closed || !gameKey || isSavingML)}
              >
                <div className="text-center text-sm font-bold">{awayAbbr}</div>
              </button>
            ) : null}
          </div>

          {/* Home row */}
          <div className="grid grid-cols-[1.2fr_1fr_1.3fr_1fr] gap-1.5 items-center mt-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <TeamLogo code={homeAbbr} size={28} />
              <span className="text-sm font-semibold text-white">{homeAbbr}</span>
            </div>

            {showSpread ? (
              <button
                disabled={!user?.uid || closed || !hasSpreadLine || !gameKey || isSavingSpread}
                onClick={() => savePick({ g, market: "spread", pick: "home", line: typeof sp.homeLine === "number" ? sp.homeLine : null, selection: "HOME" })}
                className={pickCell((pickSP as any)?.pick === "home", !user?.uid || closed || !hasSpreadLine || !gameKey || isSavingSpread)}
              >
                <div className="text-center text-sm font-bold">{showLine(sp.homeLine)}</div>
              </button>
            ) : null}

            {showOU ? (
              <button
                disabled={!user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU}
                onClick={() => savePick({ g, market: "ou", pick: "under", line: typeof ou.line === "number" ? ou.line : null, selection: "UNDER" })}
                className={pickCell((pickOU as any)?.pick === "under", !user?.uid || closed || !hasTotalLine || !gameKey || isSavingOU)}
              >
                <div className="text-center text-xs font-bold whitespace-nowrap">U {ou.line ?? "—"}</div>
              </button>
            ) : null}

            {showMoneyline ? (
              <button
                disabled={!user?.uid || closed || !gameKey || isSavingML}
                onClick={() => savePick({ g, market: "moneyline", pick: "home", line: null, selection: "HOME" })}
                className={pickCell(mlHomeActive, !user?.uid || closed || !gameKey || isSavingML)}
              >
                <div className="text-center text-sm font-bold">{homeAbbr}</div>
              </button>
            ) : null}
          </div>
        </div>

        {(!hasSpreadLine || !hasTotalLine) && (
          <div className="mt-3 text-xs text-white/50">
            {!hasSpreadLine ? <span>Spread: no line yet. </span> : null}
            {!hasTotalLine ? <span>Total: no line yet.</span> : null}
          </div>
        )}
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
               <h1 className="text-xl md:text-3xl font-bold tracking-tight">NBA Tournament</h1>
                <span className={badgeBase()}>Week {weekId}</span>
                <span className={badgeBase()}>{weekLabel}</span>
                <span className={badgeBase()}>
                  Picks: <span className="text-white/80">{myPicks.length}</span>
                </span>
                <span className={badgeBase()}>
                  View: <span className="text-white/80">{marketLabel(market)}</span>
                </span>
              </div>
              <p className="mt-2 text-white/60">
                Picks lock automatically at tip-off. Points update when games go{" "}
                <span className="text-white/80">FINAL</span>.
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
                {(["all", "scheduled", "inprogress", "final"] as StatusTab[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(k)}
                    className={[
                      "rounded-lg px-3 py-1 transition",
                      statusFilter === k ? "bg-white/10 text-white" : "text-white/60 hover:text-white",
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

          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "moneyline", "spread", "ou"] as MarketTab[]).map((m) => (
              <button key={m} onClick={() => setMarket(m)} className={marketChip(market === m)}>
                {marketLabel(m)}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/70">{sectioned.total} game(s)</div>

            <div className="mt-4">
              {sectioned.mode === "flat" ? (
                sectioned.rows.map(renderGame)
              ) : (
                <>
                  {sectioned.live.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          <div className="text-sm font-semibold text-white/90">LIVE</div>
                        </div>
                        <div className="text-xs text-white/50">{sectioned.live.length} game(s)</div>
                      </div>
                      <div className="space-y-3">{sectioned.live.map(renderGame)}</div>
                    </div>
                  )}

                  <div className="mb-2">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white/90">Today</div>
                      <div className="text-xs text-white/50">{sectioned.today.length} game(s)</div>
                    </div>

                    {sectioned.today.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                        No games today.
                      </div>
                    ) : (
                      <div className="space-y-3">{sectioned.today.map(renderGame)}</div>
                    )}
                  </div>

                  {sectioned.upcoming.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white/90">Upcoming</div>
                       <div className="flex items-center gap-3 md:gap-3">
                          <div className="text-xs text-white/50">{sectioned.upcoming.length} game(s)</div>
                          <button
                            type="button"
                            onClick={() => setShowUpcoming((v) => !v)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          >
                            {showUpcoming ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      {showUpcoming && <div className="space-y-3">{sectioned.upcoming.map(renderGame)}</div>}
                    </div>
                  )}

                  {sectioned.past.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-white/70">Past (this week)</div>
                       <div className="flex items-center gap-3 md:gap-3">
                          <div className="text-xs text-white/50">{sectioned.past.length} game(s)</div>
                          <button
                            type="button"
                            onClick={() => setShowPast((v) => !v)}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                          >
                            {showPast ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      {showPast && <div className="space-y-3 opacity-90">{sectioned.past.map(renderGame)}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 text-xs text-white/50">
            Scoring: Win 100 • Loss 0 • Push 50 (push applies to Spread / O-U when exact line hits).
          </div>
        </div>
      </div>
    </Protected>
  );
}