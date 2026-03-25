"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { listenGamesByWeekAndSport, type GameDoc } from "@/lib/firestore-games";
import {
  listenMyPicksByWeekAndSport,
  upsertPick,
  deletePickForMarket,
  type PickDoc,
} from "@/lib/firestore-picks";

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

function isClosed(g: GameDoc) {
  return g.status === "inprogress" || g.status === "final";
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

function stableGameKey(g: any): string {
  const candidates = [
    g?.matchKey,
    g?.oddsEventId,
    g?.gameId,
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
  const seen = new Set<string>();
  const out: GameDoc[] = [];

  for (const g of rows) {
    const startMs =
      g?.startTime?.toMillis?.() ?? g?.startTime?.toDate?.()?.getTime?.() ?? 0;

    const key =
      stableGameKey(g) ||
      `${String(g?.awayTeam ?? "").trim()}_${String(g?.homeTeam ?? "").trim()}_${startMs}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }

  return out;
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
    "rounded-xl border px-4 py-2 text-sm transition",
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
    return "rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left opacity-50 cursor-not-allowed";
  }
  return [
    "rounded-2xl border px-4 py-4 text-left transition",
    active
      ? "border-blue-400/50 bg-blue-500/10 text-blue-100 shadow-[0_0_0_1px_rgba(96,165,250,.25),0_0_24px_rgba(37,99,235,.12)]"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
  ].join(" ");
}

function marketLabel(m: MarketTab) {
  if (m === "all") return "All";
  if (m === "moneyline") return "Moneyline";
  if (m === "spread") return "Spread";
  return "O/U";
}

function teamBadge(team: string) {
  return team.slice(0, 3).toUpperCase();
}

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

  function pushNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3500);
  }

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
      sport as any,
      (rows) => setMyPicks(rows),
    );

    return () => unsub?.();
  }, [user?.uid, weekId, sport]);

  const pickMap = useMemo(() => {
    const m = new Map<string, PickDoc>();
    for (const p of myPicks) {
      m.set(`${p.gameId}:${p.market}`, p);
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
      rows = rows.filter(
        (g) => (g.status ?? "").toLowerCase() === statusFilter,
      );
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
  }, [games, q, statusFilter, market]);

  const groupedGames = useMemo(() => {
    const live = filteredGames.filter(
      (g) => (g.status ?? "").toLowerCase() === "inprogress",
    );
    const final = filteredGames.filter(
      (g) => (g.status ?? "").toLowerCase() === "final",
    );
    const scheduled = filteredGames.filter((g) => {
      const s = (g.status ?? "").toLowerCase();
      return s !== "inprogress" && s !== "final";
    });

    const sections: Array<{
      title: string;
      rows: GameDoc[];
      liveDot?: boolean;
    }> = [];
    if (live.length)
      sections.push({ title: "LIVE", rows: live, liveDot: true });
    if (scheduled.length) sections.push({ title: "Today", rows: scheduled });
    if (final.length) sections.push({ title: "Final", rows: final });

    return sections;
  }, [filteredGames]);

  async function savePick(args: {
    g: GameDoc;
    market: "moneyline" | "spread" | "ou";
    pick: "home" | "away" | "over" | "under";
    line: number | null;
    selection: "HOME" | "AWAY" | "OVER" | "UNDER";
  }) {
    if (!user?.uid) return;

    const gameKey = stableGameKey(args.g);

    if (!gameKey) {
      pushNotice("Este juego no tiene un gameId válido todavía.");
      return;
    }

    if (isClosed(args.g)) return;

    const existing = pickMap.get(`${gameKey}:${args.market}`);

    if (existing?.pick === args.pick) {
      const key = `${gameKey}:${args.market}`;
      setSavingKey(key);
      setErr(null);
      setNotice(null);

      try {
        await deletePickForMarket({
          uid: user.uid,
          weekId,
          sport: sport as any,
          gameId: gameKey,
          market: args.market,
        });
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      } finally {
        setSavingKey(null);
      }
      return;
    }

    const key = `${gameKey}:${args.market}`;
    setSavingKey(key);
    setErr(null);
    setNotice(null);

    try {
      await upsertPick({
        uid: user.uid,
        sport: sport as any,
        weekId,
        gameId: gameKey,
        market: args.market,
        pick: args.pick as any,
        line: args.line,
        selection: args.selection,
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Protected>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

            <div className="mt-2 text-white/60">
              Picks lock automatically at tip-off. Points update when games go{" "}
              <span className="text-white/80">FINAL</span>.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search teams…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20 sm:w-64"
            />

            <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
              {(["all", "scheduled", "inprogress", "final"] as StatusTab[]).map(
                (k) => (
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
                ),
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            ← Prev Week
          </button>

          <button
            onClick={() => setWeekOffset(0)}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Current Week
          </button>

          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Next Week →
          </button>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {notice}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {(["all", "moneyline", "spread", "ou"] as MarketTab[]).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className={marketChip(market === m)}
            >
              {marketLabel(m)}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
          <div className="text-sm text-white/70">
            {filteredGames.length} game(s)
          </div>

          <div className="mt-4 space-y-5">
            {groupedGames.map((section) => (
              <div key={section.title}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {section.liveDot ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    ) : null}
                    <div className="text-lg font-semibold">{section.title}</div>
                  </div>
                  <div className="text-sm text-white/50">
                    {section.rows.length} game(s)
                  </div>
                </div>

                <div className="space-y-3">
                  {section.rows.map((g, idx) => {
                    const closed = isClosed(g);
                    const start = fmtStart(g.startTime);
                    const gameKey = stableGameKey(g);
                    const key = gameKey || `${g.awayTeam}-${g.homeTeam}-${idx}`;

                    const pickML = gameKey
                      ? pickMap.get(`${gameKey}:moneyline`)
                      : undefined;
                    const pickSpread = gameKey
                      ? pickMap.get(`${gameKey}:spread`)
                      : undefined;
                    const pickOU = gameKey
                      ? pickMap.get(`${gameKey}:ou`)
                      : undefined;

                    const { homeLine, awayLine } = getSpread(g);
                    const { line: totalLine } = getTotal(g);

                    return (
                      <div
                        key={key}
                        className="rounded-2xl border border-white/10 bg-black/20 p-5"
                      >
                        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-2xl font-bold">
                              {g.awayTeam}{" "}
                              <span className="text-white/40">@</span>{" "}
                              {g.homeTeam}
                            </div>

                            <div className="mt-1 text-white/80">
                              {scoreText(g)}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
                              <span className={badgeBase()}>
                                Status:{" "}
                                <span className="text-white/80">
                                  {g.status}
                                </span>
                              </span>
                              {start ? (
                                <span className={badgeBase()}>{start}</span>
                              ) : null}
                              {closed ? (
                                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                                  Locked
                                </span>
                              ) : (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                                  Open
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-sm text-white/70">
                            <div>
                              ML:{" "}
                              <span className="text-white/90">
                                {pickML?.pick
                                  ? pickML.pick === "home"
                                    ? g.homeTeam
                                    : g.awayTeam
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              SP:{" "}
                              <span className="text-white/90">
                                {pickSpread?.pick
                                  ? pickSpread.pick === "home"
                                    ? `${g.homeTeam} ${showLine(homeLine)}`
                                    : `${g.awayTeam} ${showLine(awayLine)}`
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              O/U:{" "}
                              <span className="text-white/90">
                                {pickOU?.pick
                                  ? `${pickOU.pick === "over" ? "Over" : "Under"} ${showLine(totalLine, false)}`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[170px_minmax(0,1fr)] lg:items-start">
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-bold text-white/90">
                                {teamBadge(String(g.awayTeam ?? ""))}
                              </div>
                              <div className="text-2xl font-bold tracking-tight">
                                {g.awayTeam}
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-bold text-white/90">
                                {teamBadge(String(g.homeTeam ?? ""))}
                              </div>
                              <div className="text-2xl font-bold tracking-tight">
                                {g.homeTeam}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                              <div className="mb-2 text-sm text-white/60">
                                Handicap
                              </div>
                              <div className="flex flex-col gap-3">
                                <button
                                  className={pickCell(
                                    pickSpread?.pick === "away",
                                    closed ||
                                      !gameKey ||
                                      typeof awayLine !== "number",
                                  )}
                                  disabled={
                                    closed ||
                                    !gameKey ||
                                    typeof awayLine !== "number"
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
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    {g.awayTeam} {showLine(awayLine)}
                                  </div>
                                </button>

                                <button
                                  className={pickCell(
                                    pickSpread?.pick === "home",
                                    closed ||
                                      !gameKey ||
                                      typeof homeLine !== "number",
                                  )}
                                  disabled={
                                    closed ||
                                    !gameKey ||
                                    typeof homeLine !== "number"
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
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    {g.homeTeam} {showLine(homeLine)}
                                  </div>
                                </button>
                              </div>
                            </div>

                            <div>
                              <div className="mb-2 text-sm text-white/60">
                                Total
                              </div>
                              <div className="flex flex-col gap-3">
                                <button
                                  className={pickCell(
                                    pickOU?.pick === "over",
                                    closed ||
                                      !gameKey ||
                                      typeof totalLine !== "number",
                                  )}
                                  disabled={
                                    closed ||
                                    !gameKey ||
                                    typeof totalLine !== "number"
                                  }
                                  onClick={() =>
                                    savePick({
                                      g,
                                      market: "ou",
                                      pick: "over",
                                      line: totalLine,
                                      selection: "OVER",
                                    })
                                  }
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    O {showLine(totalLine, false)}
                                  </div>
                                </button>

                                <button
                                  className={pickCell(
                                    pickOU?.pick === "under",
                                    closed ||
                                      !gameKey ||
                                      typeof totalLine !== "number",
                                  )}
                                  disabled={
                                    closed ||
                                    !gameKey ||
                                    typeof totalLine !== "number"
                                  }
                                  onClick={() =>
                                    savePick({
                                      g,
                                      market: "ou",
                                      pick: "under",
                                      line: totalLine,
                                      selection: "UNDER",
                                    })
                                  }
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    U {showLine(totalLine, false)}
                                  </div>
                                </button>
                              </div>
                            </div>

                            <div>
                              <div className="mb-2 text-sm text-white/60">
                                Moneyline
                              </div>
                              <div className="flex flex-col gap-3">
                                <button
                                  className={pickCell(
                                    pickML?.pick === "away",
                                    closed || !gameKey,
                                  )}
                                  disabled={closed || !gameKey}
                                  onClick={() =>
                                    savePick({
                                      g,
                                      market: "moneyline",
                                      pick: "away",
                                      line: null,
                                      selection: "AWAY",
                                    })
                                  }
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    {g.awayTeam}
                                  </div>
                                </button>

                                <button
                                  className={pickCell(
                                    pickML?.pick === "home",
                                    closed || !gameKey,
                                  )}
                                  disabled={closed || !gameKey}
                                  onClick={() =>
                                    savePick({
                                      g,
                                      market: "moneyline",
                                      pick: "home",
                                      line: null,
                                      selection: "HOME",
                                    })
                                  }
                                >
                                  <div className="text-2xl font-bold leading-none">
                                    {g.homeTeam}
                                  </div>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {savingKey && savingKey.startsWith(`${gameKey}:`) ? (
                          <div className="mt-3 text-xs text-white/50">
                            Saving…
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-xs text-white/50">
            Scoring: Win 100 • Loss 0 • Push 50.
          </div>
        </div>
      </div>
    </Protected>
  );
}
