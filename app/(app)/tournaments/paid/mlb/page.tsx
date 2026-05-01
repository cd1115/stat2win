"use client";

import { listenMyPaidPicksByTournament, type PaidPickDoc } from "@/lib/firestore-paid-picks";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { listenGamesByWeekAndSport, type GameDoc } from "@/lib/firestore-games";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";

type StatusTab = "all" | "scheduled" | "inprogress" | "final";
type MarketTab = "all" | "moneyline" | "spread" | "ou";

type PaidTournament = {
  id: string;
  title: string;
  sport: string;
  weekId: string;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  prizes: number[];
  status: "open" | "locked" | "running" | "finished" | "cancelled";
  participantCount: number;
  deadline?: any;
  startDate?: any;
  endDate?: any;
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

function fmtDeadline(ts: any) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleDateString("es-PR", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function scoreText(g: GameDoc) {
  const home = typeof g?.scoreHome === "number" ? g.scoreHome : 0;
  const away = typeof g?.scoreAway === "number" ? g.scoreAway : 0;
  return `${String(g.awayTeam ?? "").trim()} ${away} • ${String(g.homeTeam ?? "").trim()} ${home}`;
}

function effectiveStatus(g: GameDoc): "scheduled" | "inprogress" | "final" | "locked" {
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
  const s = effectiveStatus(g);
  return s === "inprogress" || s === "final" || s === "locked";
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

function stableGameKey(g: any): string {
  const candidates = [g?.gameId, g?.matchKey, g?.oddsEventId, g?.legacyMatchKey, g?.id];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const x = c.trim();
      if (!isEpochMs13(x)) return x;
    }
    if (typeof c === "number" && Number.isFinite(c)) {
      const x = String(c);
      if (!isEpochMs13(x)) return x;
    }
  }
  return "";
}

function dedupeGames(rows: GameDoc[]) {
  const quality = (g: any) => {
    let s = 0;
    if (g?.mlbGamePk) s += 5;
    if (g?.markets?.moneyline) s += 2;
    if (g?.markets?.spread?.homeLine != null || g?.markets?.spread?.awayLine != null) s += 3;
    if (g?.markets?.total?.line != null) s += 3;
    if (g?.scoreHome != null || g?.scoreAway != null) s += 2;
    if (g?.status === "final" || g?.status === "inprogress") s += 1;
    return s;
  };
  const map = new Map<string, GameDoc>();
  for (const g of rows) {
    const startMs = g?.startTime?.toMillis?.() ?? g?.startTime?.toDate?.()?.getTime?.() ?? 0;
    const key = `${String(g?.awayTeam ?? "").trim()}_${String(g?.homeTeam ?? "").trim()}_${startMs}`;
    const prev = map.get(key);
    if (!prev || quality(g) > quality(prev)) map.set(key, g);
  }
  return Array.from(map.values());
}

function getSpread(g: any) {
  const sp = g?.markets?.spread ?? g?.markets?.sp ?? null;
  const homeLine =
    typeof sp?.homeLine === "number" ? sp.homeLine :
    typeof sp?.lineHome === "number" ? sp.lineHome :
    typeof sp?.home === "number" ? sp.home :
    typeof sp?.line === "number" ? sp.line : null;
  const awayLine =
    typeof sp?.awayLine === "number" ? sp.awayLine :
    typeof sp?.lineAway === "number" ? sp.lineAway :
    typeof sp?.away === "number" ? sp.away :
    typeof homeLine === "number" ? -homeLine : null;
  return { homeLine, awayLine };
}

function getTotal(g: any) {
  const t = g?.markets?.total ?? g?.markets?.totals ?? g?.markets?.ou ?? null;
  const line =
    typeof t?.line === "number" ? t.line :
    typeof t?.total === "number" ? t.total :
    typeof t?.points === "number" ? t.points : null;
  return { line };
}

function showLine(n: number | null, prefixPlus = true) {
  if (typeof n !== "number") return "—";
  if (n > 0 && prefixPlus) return `+${n}`;
  return `${n}`;
}

const MLB_TEAM_CODES: Record<string, string> = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "LA Angels": "LAA", "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN",
  "New York Mets": "NYM", "New York Yankees": "NYY", "Athletics": "OAK",
  "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD", "Seattle Mariners": "SEA", "San Francisco Giants": "SF",
  "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
};

function normalizeMlbCode(v: string) {
  const s = String(v || "").trim().toUpperCase();
  const alias: Record<string, string> = { KCR: "KC", CHW: "CWS", SFG: "SF", SDP: "SD", TBR: "TB", WAS: "WSH" };
  return alias[s] ?? s;
}

function teamAbbrFrom(g: any, side: "home" | "away") {
  const explicit = side === "home"
    ? (g?.homeTeamAbbr ?? g?.homeAbbr ?? g?.teams?.homeAbbr)
    : (g?.awayTeamAbbr ?? g?.awayAbbr ?? g?.teams?.awayAbbr);
  if (typeof explicit === "string" && explicit.trim()) return normalizeMlbCode(explicit);
  const name = side === "home" ? g?.homeTeam : g?.awayTeam;
  if (typeof name === "string" && MLB_TEAM_CODES[name]) return MLB_TEAM_CODES[name];
  const fromName = typeof name === "string" && name.trim() ? name.trim().slice(0, 3).toUpperCase() : "";
  return normalizeMlbCode(fromName || (side === "home" ? "HOME" : "AWAY"));
}

function formatCallableError(e: any) {
  const code = e?.code ? String(e.code) : "";
  const msg = e?.message ? String(e.message) : "Error desconocido";
  const details = e?.details != null ? (typeof e.details === "string" ? e.details : JSON.stringify(e.details)) : "";
  return [code && `(${code})`, msg, details && `details=${details}`].filter(Boolean).join(" | ");
}

function prDayNum(d: Date): number {
  const s = d.toLocaleString("en-US", { timeZone: "America/Puerto_Rico" });
  const p = new Date(s);
  return p.getFullYear() * 10000 + (p.getMonth() + 1) * 100 + p.getDate();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TeamLogo({ code, size = 40 }: { code: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const safeCode = String(code || "").trim().toUpperCase();
  const src = `/teams/mlb/${safeCode}.png`;
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-400/5"
      style={{ width: size, height: size }}
    >
      {!imgError ? (
        <Image src={src} alt={safeCode} width={size} height={size}
          className="h-full w-full object-contain" onError={() => setImgError(true)} />
      ) : (
        <span className="text-sm font-semibold text-amber-200">{safeCode.slice(0, 3)}</span>
      )}
    </div>
  );
}

// Amber-tinted pick cell for paid tournament
function paidPickCell(active: boolean, disabled: boolean) {
  if (disabled) {
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  }
  return [
    "rounded-2xl border px-3 py-3 text-left transition",
    active
      ? "border-amber-400/70 bg-amber-500/15 text-white shadow-[0_0_0_1px_rgba(251,191,36,.35),0_0_28px_rgba(251,191,36,.18)]"
      : "border-white/10 bg-black/20 text-white/80 hover:border-amber-400/30 hover:bg-amber-400/5",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Main inner component (uses hooks)
// ---------------------------------------------------------------------------

function PaidMlbContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("id") ?? "";

  const [tournament, setTournament] = useState<PaidTournament | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPicks, setMyPicks] = useState<PaidPickDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [market, setMarket] = useState<MarketTab>("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [optimisticPicks, setOptimisticPicks] = useState<Record<string, Partial<PaidPickDoc> & { pick: string }>>({});

  const placePickFn = useMemo(() => httpsCallable(functions, "placePaidPick"), []);

  // Load tournament doc
  useEffect(() => {
    if (!tournamentId) return;
    const ref = doc(db, "paid_tournaments", tournamentId);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...(snap.data() as any) });
    });
  }, [tournamentId]);

  // Check if user has paid entry
  useEffect(() => {
    if (!tournamentId || !user?.uid) { setLoadingEntry(false); return; }
    const entryId = `${tournamentId}_${user.uid}`;
    const ref = doc(db, "paid_tournament_entries", entryId);
    const unsub = onSnapshot(ref, (snap) => {
      setIsPaid(snap.exists() && snap.data()?.paymentStatus === "paid");
      setLoadingEntry(false);
    });
    return () => unsub();
  }, [tournamentId, user?.uid]);

  // Load games for this week
  useEffect(() => {
    if (!tournament?.weekId) return;
    const unsub = listenGamesByWeekAndSport(
      "MLB" as any,
      tournament.weekId,
      (rows) => setGames(dedupeGames(rows)),
      (e) => setErr(String((e as any)?.message ?? e)),
    );
    return () => unsub?.();
  }, [tournament?.weekId]);

  // Load my paid picks
  useEffect(() => {
    if (!user?.uid || !tournamentId) { setMyPicks([]); return; }
    const unsub = listenMyPaidPicksByTournament(
      user.uid,
      tournamentId,
      (rows) => setMyPicks(rows),
      (e) => setErr(String((e as any)?.message ?? e)),
    );
    return () => unsub?.();
  }, [user?.uid, tournamentId]);

  function pushNotice(msg: string) {
    setNotice(msg);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3500);
  }

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const pickMap = useMemo(() => {
    const m = new Map<string, PaidPickDoc>();
    const put = (id: any, mk: any, p: PaidPickDoc) => {
      if (!id || !mk) return;
      const key = `${String(id).trim()}:${String(mk).trim()}`;
      if (!m.has(key)) m.set(key, p);
    };
    for (const p of myPicks) {
      put((p as any).gameId, (p as any).market, p);
      put((p as any).gameDocId, (p as any).market, p);
    }
    return m;
  }, [myPicks]);

  const filteredGames = useMemo(() => {
    let rows = [...games].sort((a, b) =>
      (a.startTime?.toMillis?.() ?? 0) - (b.startTime?.toMillis?.() ?? 0));
    const qq = q.trim().toLowerCase();
    if (qq) rows = rows.filter(g =>
      String(g.homeTeam ?? "").toLowerCase().includes(qq) ||
      String(g.awayTeam ?? "").toLowerCase().includes(qq));
    if (statusFilter !== "all") rows = rows.filter(g => effectiveStatus(g) === statusFilter);
    if (market === "spread") rows = rows.filter(g => {
      const sp = getSpread(g);
      return typeof sp.homeLine === "number" || typeof sp.awayLine === "number";
    });
    if (market === "ou") rows = rows.filter(g => typeof getTotal(g).line === "number");
    return rows;
  }, [games, q, statusFilter, market]);

  const sectioned = useMemo(() => {
    const now = new Date();
    const startMs = (g: GameDoc) => g.startTime?.toMillis?.() ?? g.startTime?.toDate?.()?.getTime?.() ?? 0;
    const todayNum = prDayNum(now);
    const gameDayNum = (g: GameDoc): number | null => { const ms = startMs(g); return ms ? prDayNum(new Date(ms)) : null; };

    if (statusFilter !== "all") {
      const rows = [...filteredGames].sort((a, b) => startMs(a) - startMs(b));
      return { mode: "flat" as const, total: rows.length, rows };
    }

    const rows = [...filteredGames];
    const live = rows.filter(g => String(g?.status ?? "").toLowerCase() === "inprogress").sort((a, b) => startMs(a) - startMs(b));
    const liveSet = new Set(live.map(g => g.id));

    const today = rows.filter(g => {
      if (liveSet.has(g.id)) return false;
      const s = String(g?.status ?? "").toLowerCase();
      if (s === "final" || s === "inprogress") return false;
      return gameDayNum(g) === todayNum;
    }).sort((a, b) => startMs(a) - startMs(b));

    const upcoming = rows.filter(g => {
      if (liveSet.has(g.id)) return false;
      const s = String(g?.status ?? "").toLowerCase();
      if (s === "final" || s === "inprogress") return false;
      const d = gameDayNum(g);
      return d !== null && d > todayNum;
    }).sort((a, b) => startMs(a) - startMs(b));

    const past = rows.filter(g => {
      if (liveSet.has(g.id)) return false;
      const s = String(g?.status ?? "").toLowerCase();
      if (s === "final") return true;
      if (s === "inprogress") return false;
      const d = gameDayNum(g);
      return d !== null && d < todayNum;
    }).sort((a, b) => startMs(b) - startMs(a));

    return { mode: "sections" as const, total: live.length + today.length + upcoming.length + past.length, live, today, upcoming, past };
  }, [filteredGames, statusFilter]);

  async function savePick(args: {
    g: GameDoc;
    market: "moneyline" | "spread" | "ou";
    pick: "home" | "away" | "over" | "under";
    line: number | null;
    selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  }) {
    if (!user?.uid || !isPaid) return;
    if (isClosed(args.g)) return;

    const gameKey = String((args.g as any).gameId ?? stableGameKey(args.g) ?? "").trim();
    const gameKeySafe = gameKey || String(args.g.id);
    if (!gameKeySafe) { pushNotice("gameId inválido. No se puede pickear."); return; }

    const key = `${gameKeySafe}:${args.market}`;

    const existing =
      (optimisticPicks[key] as any) ||
      pickMap.get(`${gameKeySafe}:${args.market}`) ||
      pickMap.get(`${String(args.g.id)}:${args.market}`);

    const canonicalSelection = args.pick;

    // Toggle off
    if (existing?.pick === args.pick) {
      setSavingKey(key);
      setOptimisticPicks(prev => { const n = { ...prev }; delete n[key]; return n; });
      try {
        await placePickFn({
          tournamentId,
          gameId: (args.g as any).gameId ?? gameKey,
          gameDocId: args.g.id,
          market: args.market,
          pick: canonicalSelection,
          selection: args.selection,
          line: args.line,
          clear: true,
        });
      } catch (e: any) {
        setOptimisticPicks(prev => ({ ...prev, [key]: { market: args.market, pick: existing?.pick ?? canonicalSelection, selection: args.selection } }));
        setErr(formatCallableError(e));
      } finally { setSavingKey(null); }
      return;
    }

    // Moneyline + Spread conflict check
    if (args.market === "moneyline") {
      const sp = optimisticPicks[`${gameKeySafe}:spread`] || pickMap.get(`${gameKeySafe}:spread`);
      if ((sp as any)?.pick) { pushNotice("No puedes combinar Moneyline y Spread en el mismo juego."); return; }
    }
    if (args.market === "spread") {
      const ml = optimisticPicks[`${gameKeySafe}:moneyline`] || pickMap.get(`${gameKeySafe}:moneyline`);
      if ((ml as any)?.pick) { pushNotice("No puedes combinar Spread y Moneyline en el mismo juego."); return; }
    }

    setSavingKey(key);
    setOptimisticPicks(prev => ({ ...prev, [key]: { market: args.market, pick: canonicalSelection, selection: args.selection } }));

    try {
      await placePickFn({
        tournamentId,
        gameId: (args.g as any).gameId ?? gameKey,
        gameDocId: args.g.id,
        market: args.market,
        pick: canonicalSelection,
        selection: args.selection,
        line: args.line,
      });
    } catch (e: any) {
      setOptimisticPicks(prev => { const n = { ...prev }; delete n[key]; return n; });
      setErr(formatCallableError(e));
    } finally { setSavingKey(null); }
  }

  const renderGame = (g: GameDoc, idx: number) => {
    const closed = isClosed(g);
    const effective = effectiveStatus(g);
    const start = fmtStart(g.startTime);
    const gameKey = String((g as any).gameId ?? stableGameKey(g) ?? "").trim();
    const gameKeySafe = gameKey || String((g as any).id ?? "").trim();
    const key = gameKeySafe || `${g.awayTeam}-${g.homeTeam}-${idx}`;

    const pickFor = (mk: "moneyline" | "spread" | "ou") => {
      const k = `${gameKeySafe}:${mk}`;
      return (optimisticPicks[k] as any) || pickMap.get(`${gameKeySafe}:${mk}`) || pickMap.get(`${String((g as any).id ?? "").trim()}:${mk}`) || null;
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
    const mlPicked = (pickML as any)?.selectionForMarket ?? (pickML as any)?.teamAbbr ?? null;
    const mlAwayActive = mlPicked === awayAbbr || (mlPicked == null && (pickML as any)?.pick === "away");
    const mlHomeActive = mlPicked === homeAbbr || (mlPicked == null && (pickML as any)?.pick === "home");

    const disabled = !isPaid || closed || !gameKeySafe;

    return (
      <div key={key} className="rounded-2xl border border-amber-400/10 bg-black/20 p-3 md:p-4 hover:border-amber-400/20 transition-colors">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-white">
              {g.awayTeam} <span className="text-amber-400/40">@</span> {g.homeTeam}
            </div>
            <div className="mt-1 text-sm text-white/70">{scoreText(g)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {effective === "final" ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-0.5 text-xs text-white/60">Final</span>
              ) : effective === "inprogress" ? (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-0.5 text-xs text-red-300">En Curso</span>
              ) : closed ? (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-0.5 text-xs text-red-300">Cerrado</span>
              ) : (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/8 px-2 py-0.5 text-xs text-amber-300">Abierto</span>
              )}
              {start ? <span className="rounded-full border border-white/8 bg-white/4 px-3 py-0.5 text-xs text-white/50">{start}</span> : null}
            </div>
          </div>

          {/* Summary of picks made */}
          <div className="text-xs text-white/50 shrink-0">
            <div>ML: <span className="text-white/70">{(pickML as any)?.pick ? ((pickML as any).pick === "home" ? g.homeTeam : g.awayTeam) : "—"}</span></div>
            <div>SP: <span className="text-white/70">{(pickSpread as any)?.pick ? ((pickSpread as any).pick === "home" ? `${g.homeTeam} ${showLine(homeLine)}` : `${g.awayTeam} ${showLine(awayLine)}`) : "—"}</span></div>
            <div>O/U: <span className="text-white/70">{(pickOU as any)?.pick ? `${(pickOU as any).pick === "over" ? "Over" : "Under"} ${showLine(totalLine, false)}` : "—"}</span></div>
          </div>
        </div>

        {/* Pick cells — DraftKings layout */}
        <div className="mt-3 space-y-0">
          <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1.1fr_1fr] gap-1.5 mb-1.5 px-1">
            <div />
            {showSpread && <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-amber-400/40">Spread</div>}
            {showOU && <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-amber-400/40">Total</div>}
            {showMoneyline && <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-amber-400/40">Moneyline</div>}
          </div>

          {/* Away row */}
          <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1.1fr_1fr] gap-1.5 items-center">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo code={awayAbbr} size={32} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-amber-400/50 uppercase tracking-wide">{awayAbbr}</div>
                <div className="truncate text-sm font-bold text-white leading-tight">{g.awayTeam}</div>
              </div>
            </div>
            {showSpread && (
              <button className={paidPickCell(pickSpread?.pick === "away", disabled || typeof awayLine !== "number")}
                disabled={disabled || typeof awayLine !== "number"}
                onClick={() => savePick({ g, market: "spread", pick: "away", line: awayLine, selection: "AWAY" })}>
                <div className="text-center text-sm font-bold">{typeof awayLine === "number" ? showLine(awayLine) : "—"}</div>
              </button>
            )}
            {showOU && (
              <button className={paidPickCell(pickOU?.pick === "over", disabled || typeof totalLine !== "number")}
                disabled={disabled || typeof totalLine !== "number"}
                onClick={() => savePick({ g, market: "ou", pick: "over", line: totalLine, selection: "OVER" })}>
                <div className="text-center text-xs font-bold whitespace-nowrap">{typeof totalLine === "number" ? `O ${totalLine}` : "—"}</div>
              </button>
            )}
            {showMoneyline && (
              <button className={paidPickCell(mlAwayActive, disabled)}
                disabled={disabled}
                onClick={() => savePick({ g, market: "moneyline", pick: "away", line: null, selection: "AWAY" })}>
                <div className="text-center text-sm font-bold">{awayAbbr}</div>
              </button>
            )}
          </div>

          {/* Home row */}
          <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1.1fr_1fr] gap-1.5 items-center mt-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo code={homeAbbr} size={32} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-amber-400/50 uppercase tracking-wide">{homeAbbr}</div>
                <div className="truncate text-sm font-bold text-white leading-tight">{g.homeTeam}</div>
              </div>
            </div>
            {showSpread && (
              <button className={paidPickCell(pickSpread?.pick === "home", disabled || typeof homeLine !== "number")}
                disabled={disabled || typeof homeLine !== "number"}
                onClick={() => savePick({ g, market: "spread", pick: "home", line: homeLine, selection: "HOME" })}>
                <div className="text-center text-sm font-bold">{typeof homeLine === "number" ? showLine(homeLine) : "—"}</div>
              </button>
            )}
            {showOU && (
              <button className={paidPickCell(pickOU?.pick === "under", disabled || typeof totalLine !== "number")}
                disabled={disabled || typeof totalLine !== "number"}
                onClick={() => savePick({ g, market: "ou", pick: "under", line: totalLine, selection: "UNDER" })}>
                <div className="text-center text-xs font-bold whitespace-nowrap">{typeof totalLine === "number" ? `U ${totalLine}` : "—"}</div>
              </button>
            )}
            {showMoneyline && (
              <button className={paidPickCell(mlHomeActive, disabled)}
                disabled={disabled}
                onClick={() => savePick({ g, market: "moneyline", pick: "home", line: null, selection: "HOME" })}>
                <div className="text-center text-sm font-bold">{homeAbbr}</div>
              </button>
            )}
          </div>
        </div>

        {savingKey && gameKeySafe && savingKey.startsWith(`${gameKeySafe}:`) && (
          <div className="mt-3 text-xs text-amber-400/50">Guardando…</div>
        )}
      </div>
    );
  };

  // ---- Render guards ----
  if (!tournamentId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/40">
        <p>No se especificó un torneo. Agrega <code>?id=...</code> a la URL.</p>
      </div>
    );
  }

  if (loadingEntry) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-black text-white mb-2">Acceso restringido</h2>
          <p className="text-sm text-white/40 mb-4">
            Debes estar inscrito con pago confirmado para hacer picks en este torneo.
          </p>
          <a href={`/tournaments/paid/detail?id=${tournamentId}`}
            className="inline-block rounded-full bg-amber-400 px-6 py-2 text-sm font-bold text-black hover:bg-amber-300 transition-colors">
            Ver torneo e inscribirme
          </a>
        </div>
      </div>
    );
  }

  const tournamentActive = tournament && ["open", "locked", "running"].includes(tournament.status);

  return (
    <div className="px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-4xl">

        {/* ── Header ── */}
        <div className="mb-5">
          {/* Gold accent bar */}
          <div className="h-[3px] w-full rounded-full bg-gradient-to-r from-amber-400/0 via-amber-400 to-amber-400/0 mb-4" />

          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Torneo de Pago
                </span>
                <span className="rounded-md border border-white/8 bg-white/4 px-2 py-px text-[10px] font-black text-white/30 uppercase">MLB</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                {tournament?.title ?? "MLB Paid Tournament"}
              </h1>
              {tournament?.weekId && (
                <p className="text-xs text-white/35 mt-0.5">Semana {tournament.weekId} · Cierra: {fmtDeadline(tournament?.deadline)}</p>
              )}
            </div>

            {/* Tournament stats */}
            {tournament && (
              <div className="flex gap-3 shrink-0">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2 text-center">
                  <div className="text-lg font-black text-amber-300">{fmtUsd(tournament.prizes[0] ?? 0)}</div>
                  <div className="text-[9px] text-amber-400/50 uppercase tracking-wider">1er lugar</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-center">
                  <div className="text-sm font-black text-white/70">{tournament.participantCount}</div>
                  <div className="text-[9px] text-white/30 uppercase tracking-wider">inscritos</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-center">
                  <div className="text-sm font-black text-white/70">{myPicks.length}</div>
                  <div className="text-[9px] text-white/30 uppercase tracking-wider">mis picks</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Inactive warning ── */}
        {tournament && !tournamentActive && (
          <div className="mb-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-center">
            <div className="text-sm text-white/40">
              Este torneo está <span className="font-bold text-white/60">{tournament.status}</span>. Los picks están cerrados.
            </div>
          </div>
        )}

        {/* ── Error / Notice ── */}
        {err && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{notice}</div>
        )}

        {/* ── Filters ── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar equipo…"
            className="w-full sm:w-56 rounded-xl border border-amber-400/15 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-400/40"
          />
          <div className="flex gap-2">
            {/* Market filter */}
            <div className="flex rounded-xl border border-amber-400/15 bg-black/20 p-1 text-xs">
              {(["all", "moneyline", "spread", "ou"] as MarketTab[]).map(m => (
                <button key={m} onClick={() => setMarket(m)}
                  className={["rounded-lg px-2.5 py-1 transition",
                    market === m ? "bg-amber-400/15 text-amber-300" : "text-white/50 hover:text-white/80"].join(" ")}>
                  {m === "all" ? "Todos" : m === "moneyline" ? "ML" : m === "spread" ? "Spread" : "O/U"}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
              {(["all", "scheduled", "inprogress", "final"] as StatusTab[]).map(k => (
                <button key={k} onClick={() => setStatusFilter(k)}
                  className={["rounded-lg px-2.5 py-1 transition",
                    statusFilter === k ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"].join(" ")}>
                  {k === "all" ? "Todo" : k === "scheduled" ? "Hoy" : k === "inprogress" ? "Live" : "Final"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Games ── */}
        <div className="rounded-2xl border border-amber-400/10 bg-white/[0.02] p-4">
          <div className="text-xs text-amber-400/40 mb-4 font-semibold uppercase tracking-wider">
            {sectioned.total} juego{sectioned.total !== 1 ? "s" : ""}
          </div>

          {sectioned.mode === "flat" ? (
            <div className="space-y-3">{sectioned.rows.map((g, i) => renderGame(g, i))}</div>
          ) : (
            <>
              {sectioned.live.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-bold text-white/90">LIVE</span>
                    <span className="text-xs text-white/40">{sectioned.live.length} juego(s)</span>
                  </div>
                  <div className="space-y-3">{sectioned.live.map((g, i) => renderGame(g, i))}</div>
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white/90">Hoy</span>
                  <span className="text-xs text-white/40">{sectioned.today.length} juego(s)</span>
                </div>
                {sectioned.today.length === 0 ? (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-6 text-center text-sm text-white/40">
                    No hay juegos de MLB hoy.
                  </div>
                ) : (
                  <div className="space-y-3">{sectioned.today.map((g, i) => renderGame(g, i))}</div>
                )}
              </div>

              {sectioned.upcoming.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white/90">Próximos</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/40">{sectioned.upcoming.length} juego(s)</span>
                      <button onClick={() => setShowUpcoming(v => !v)}
                        className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-0.5 text-xs text-amber-300/70 hover:bg-amber-400/10 transition-colors">
                        {showUpcoming ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                  {showUpcoming && (
                    <div className="space-y-3">{sectioned.upcoming.map((g, i) => renderGame(g, i))}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-white/20">
          Torneo de pago · Picks se bloquean al primer pitcheo · Ganadores reciben premio en efectivo
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export — wraps with Suspense for static export compatibility
// ---------------------------------------------------------------------------
export default function PaidMlbPage() {
  return (
    <Protected>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
        </div>
      }>
        <PaidMlbContent />
      </Suspense>
    </Protected>
  );
}
