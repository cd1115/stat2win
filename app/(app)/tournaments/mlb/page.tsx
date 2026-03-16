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

function isClosed(g: GameDoc) {
  return g.status === "inprogress" || g.status === "final";
}

function isEpochMs13(v: unknown) {
  return typeof v === "string" && /^\d{13}$/.test(v);
}

/**
 * ✅ ONLY allow numeric gameId for picks (no random doc ids), reject epoch ms (13 digits).
 */
function stableGameKey(g: any): string {
  const candidate = g?.gameId ?? null;

  if (typeof candidate === "string" && candidate.trim()) {
    const x = candidate.trim();
    if (!/^\d+$/.test(x)) return "";
    if (isEpochMs13(x)) return "";
    return x;
  }

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    const x = String(candidate);
    if (!/^\d+$/.test(x)) return "";
    if (isEpochMs13(x)) return "";
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

function pickCell(active: boolean, disabled: boolean) {
  if (disabled) {
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  }
  return [
    "rounded-2xl border px-3 py-3 text-left transition",
    active
      ? "border-blue-400/40 bg-blue-500/10 text-blue-100 shadow-[0_0_0_1px_rgba(255,255,255,.06)]"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
  ].join(" ");
}

function marketLabel(m: MarketTab) {
  if (m === "all") return "All";
  if (m === "moneyline") return "Moneyline";
  if (m === "spread") return "Spread";
  return "O/U";
}

export default function MlbTournamentPage() {
  const { user } = useAuth();
  const sport = "MLB" as const;

  const [weekId] = useState(() => getWeekId(new Date()));
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

  useEffect(() => {
    setErr(null);
    if (!weekId) return;

    const unsub = listenGamesByWeekAndSport(
      sport as any,
      weekId,
      (rows) => setGames(rows),
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

    return rows;
  }, [games, q, statusFilter]);

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
      pushNotice(
        "Este juego no tiene un gameId válido (debe ser numérico). Crea MLB games con gameId estable igual que NBA.",
      );
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
        selection:
  args.selection === "HOME" ||
  args.selection === "AWAY" ||
  args.selection === "OVER" ||
  args.selection === "UNDER"
    ? args.selection
    : undefined,
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSavingKey(null);
    }
  }

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

          <div className="mb-4 flex flex-wrap gap-2">
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

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/70">
              {filteredGames.length} game(s)
            </div>

            <div className="mt-4 space-y-3">
              {filteredGames.map((g) => {
                const closed = isClosed(g);
                const start = fmtStart(g.startTime);

                const sp = getSpread(g as any);
                const ou = getTotal(g as any);

                const gameKey = stableGameKey(g);
                const pickML = gameKey
                  ? pickMap.get(`${gameKey}:moneyline`)
                  : undefined;
                const pickSP = gameKey
                  ? pickMap.get(`${gameKey}:spread`)
                  : undefined;
                const pickOU = gameKey
                  ? pickMap.get(`${gameKey}:ou`)
                  : undefined;

                return (
                  <div
                    key={g.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">
                          {g.awayTeam} <span className="text-white/40">@</span>{" "}
                          {g.homeTeam}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                          <span className={badgeBase()}>
                            Status:{" "}
                            <span className="text-white/80">{g.status}</span>
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
                            {pickML?.pick
                              ? pickML.pick === "home"
                                ? g.homeTeam
                                : g.awayTeam
                              : "—"}
                          </span>
                        </div>
                        <div>
                          SP:{" "}
                          <span className="text-white/80">
                            {pickSP?.pick
                              ? pickSP.pick === "home"
                                ? `${g.homeTeam} ${showLine(sp.homeLine)}`
                                : `${g.awayTeam} ${showLine(sp.awayLine)}`
                              : "—"}
                          </span>
                        </div>
                        <div>
                          O/U:{" "}
                          <span className="text-white/80">
                            {pickOU?.pick
                              ? pickOU.pick === "over"
                                ? `Over ${ou.line ?? "—"}`
                                : `Under ${ou.line ?? "—"}`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Picks UI (igual al NBA) */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {/* Spread */}
                      <div className="space-y-2">
                        <div className="text-xs text-white/60">Handicap</div>
                        <button
                          className={pickCell(
                            pickSP?.pick === "away",
                            closed || !gameKey,
                          )}
                          disabled={closed || !gameKey}
                          onClick={() =>
                            savePick({
                              g,
                              market: "spread",
                              pick: "away",
                              line: sp.awayLine,
                              selection: "AWAY",
                            })
                          }
                        >
                          {g.awayTeam} {showLine(sp.awayLine)}
                        </button>
                        <button
                          className={pickCell(
                            pickSP?.pick === "home",
                            closed || !gameKey,
                          )}
                          disabled={closed || !gameKey}
                          onClick={() =>
                            savePick({
                              g,
                              market: "spread",
                              pick: "home",
                              line: sp.homeLine,
                              selection: "HOME",
                            })
                          }
                        >
                          {g.homeTeam} {showLine(sp.homeLine)}
                        </button>
                      </div>

                      {/* Total */}
                      <div className="space-y-2">
                        <div className="text-xs text-white/60">Total</div>
                        <button
                          className={pickCell(
                            pickOU?.pick === "over",
                            closed || !gameKey,
                          )}
                          disabled={closed || !gameKey}
                          onClick={() =>
                            savePick({
                              g,
                              market: "ou",
                              pick: "over",
                              line: ou.line,
                              selection: "OVER",
                            })
                          }
                        >
                          O {ou.line ?? "—"}
                        </button>
                        <button
                          className={pickCell(
                            pickOU?.pick === "under",
                            closed || !gameKey,
                          )}
                          disabled={closed || !gameKey}
                          onClick={() =>
                            savePick({
                              g,
                              market: "ou",
                              pick: "under",
                              line: ou.line,
                              selection: "UNDER",
                            })
                          }
                        >
                          U {ou.line ?? "—"}
                        </button>
                      </div>

                      {/* Moneyline */}
                      <div className="space-y-2">
                        <div className="text-xs text-white/60">Moneyline</div>
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
                          {g.awayTeam}
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
                          {g.homeTeam}
                        </button>
                      </div>
                    </div>

                    {savingKey === `${stableGameKey(g)}:moneyline` ||
                    savingKey === `${stableGameKey(g)}:spread` ||
                    savingKey === `${stableGameKey(g)}:ou` ? (
                      <div className="mt-3 text-xs text-white/50">Saving…</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-xs text-white/50">
              Scoring: Win 100 • Loss 0 • Push 50 (push applies to Spread / O-U
              when exact line hits).
            </div>
          </div>
        </div>
      </div>
    </Protected>
  );
}
