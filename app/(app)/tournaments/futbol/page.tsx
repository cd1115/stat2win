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

function stableGameKey(g: any): string {
  const candidate = g?.gameId ?? null;

  if (typeof candidate === "string" && candidate.trim()) {
    const x = candidate.trim();
    if (isEpochMs13(x)) return "";
    return x;
  }

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    const x = String(candidate);
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

export default function FutbolTournamentPage() {
  const { user } = useAuth();
  const sport = "SOCCER" as const;

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

  useEffect(() => {
    setErr(null);
    if (!weekId) return;

    const unsub = listenGamesByWeekAndSport(
      sport,
      weekId,
      (rows) => setGames(rows),
      (e) => setErr(String((e as any)?.message ?? e))
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
      setMyPicks(rows)
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return games.filter((g: any) => {
      const gameKey = stableGameKey(g);
      if (!gameKey) return false;

      if (statusFilter !== "all" && g.status !== statusFilter) return false;

      if (!query) return true;
      const hay = `${g.away ?? ""} ${g.home ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [games, q, statusFilter]);

  async function handlePick(args: {
    g: any;
    market: Exclude<MarketTab, "all">;
    pick: "home" | "away" | "over" | "under";
    line?: number | null;
    selection?: string | null;
  }) {
    if (!user?.uid) return;

    const gameKey = stableGameKey(args.g);
    if (!gameKey) {
      pushNotice("Este juego no tiene gameId estable todavía.");
      return;
    }

    const closed = isClosed(args.g);
    if (closed) {
      pushNotice("Picks cerrados. El juego ya comenzó o está FINAL.");
      return;
    }

    if (args.market === "moneyline") {
      const existingSpread = pickMap.get(`${gameKey}:spread`);
      if (existingSpread?.pick) {
        pushNotice(
          "No puedes combinar Moneyline y Spread en el mismo juego. Quita el pick de Spread (My Picks) y luego selecciona Moneyline."
        );
        return;
      }
    }

    if (args.market === "spread") {
      const existingML = pickMap.get(`${gameKey}:moneyline`);
      if (existingML?.pick) {
        pushNotice(
          "No puedes combinar Spread y Moneyline en el mismo juego. Quita el pick de Moneyline (My Picks) y luego selecciona Spread."
        );
        return;
      }
    }

    const key = `${gameKey}:${args.market}`;
    setSavingKey(key);
    setErr(null);
    setNotice(null);

    try {
      await upsertPick({
        uid: user.uid,
        sport,
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

  async function handleClearMarket(gameKey: string, m: Exclude<MarketTab, "all">) {
    if (!user?.uid) return;

    const key = `${gameKey}:${m}`;
    setSavingKey(key);
    setErr(null);

    try {
      await deletePickForMarket(user.uid, weekId, sport, gameKey, m);
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
                  Fútbol Tournament
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
                Picks lock automatically at start time. Points update when games go{" "}
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
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2">
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

          <div className="mb-5 flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs w-fit">
            {(["all", "scheduled", "inprogress", "final"] as StatusTab[]).map((k) => (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className={[
                  "rounded-lg px-3 py-2 transition",
                  statusFilter === k
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white",
                ].join(" ")}
              >
                {k === "all"
                  ? "All"
                  : k === "scheduled"
                    ? "Scheduled"
                    : k === "inprogress"
                      ? "Live"
                      : "Final"}
              </button>
            ))}
          </div>

          {notice ? (
            <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {notice}
            </div>
          ) : null}

          {err ? (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}

          <div className="space-y-3">
            {filtered.map((g: any) => {
              const gameKey = stableGameKey(g);
              if (!gameKey) return null;

              const closed = isClosed(g);

              const mlPick = pickMap.get(`${gameKey}:moneyline`);
              const spPick = pickMap.get(`${gameKey}:spread`);
              const ouPick = pickMap.get(`${gameKey}:ou`);

              const { homeLine, awayLine } = getSpread(g);
              const { line: totalLine } = getTotal(g);

              const showML = market === "all" || market === "moneyline";
              const showSP = market === "all" || market === "spread";
              const showOU = market === "all" || market === "ou";

              return (
                <div
                  key={gameKey}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">
                          {g.away} @ {g.home}
                        </div>
                        <span className={badgeBase()}>
                          {g.status === "scheduled"
                            ? "Scheduled"
                            : g.status === "inprogress"
                              ? "Live"
                              : g.status === "final"
                                ? "Final"
                                : g.status}
                        </span>
                        {g.startAt ? (
                          <span className={badgeBase()}>{fmtStart(g.startAt)}</span>
                        ) : null}
                        {closed ? (
                          <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                            Locked
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs text-white/50">
                        gameId: <span className="text-white/60">{gameKey}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(["moneyline", "spread", "ou"] as const).map((m) => {
                        const k = `${gameKey}:${m}`;
                        const hasPick = pickMap.get(k)?.pick;
                        const busy = savingKey === k;

                        return hasPick ? (
                          <button
                            key={m}
                            disabled={busy}
                            onClick={() => handleClearMarket(gameKey, m)}
                            className={[
                              "rounded-xl border px-3 py-2 text-xs transition",
                              "border-white/10 bg-black/20 text-white/70 hover:bg-white/5",
                              busy ? "opacity-60" : "",
                            ].join(" ")}
                          >
                            {busy ? "Clearing..." : `Clear ${marketLabel(m)}`}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {showML ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs text-white/60">
                          Moneyline
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={closed || savingKey === `${gameKey}:moneyline`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "moneyline",
                                pick: "away",
                                line: null,
                                selection: g.away,
                              })
                            }
                            className={pickCell(mlPick?.pick === "away", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              {g.away}
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              Pick away
                            </div>
                          </button>

                          <button
                            disabled={closed || savingKey === `${gameKey}:moneyline`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "moneyline",
                                pick: "home",
                                line: null,
                                selection: g.home,
                              })
                            }
                            className={pickCell(mlPick?.pick === "home", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              {g.home}
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              Pick home
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {showSP ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs text-white/60">Spread</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={closed || savingKey === `${gameKey}:spread`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "spread",
                                pick: "away",
                                line: awayLine ?? null,
                                selection: `${g.away} ${showLine(awayLine)}`,
                              })
                            }
                            className={pickCell(spPick?.pick === "away", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              {g.away}
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {showLine(awayLine)}
                            </div>
                          </button>

                          <button
                            disabled={closed || savingKey === `${gameKey}:spread`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "spread",
                                pick: "home",
                                line: homeLine ?? null,
                                selection: `${g.home} ${showLine(homeLine)}`,
                              })
                            }
                            className={pickCell(spPick?.pick === "home", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              {g.home}
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {showLine(homeLine)}
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {showOU ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 text-xs text-white/60">O/U</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={closed || savingKey === `${gameKey}:ou`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "ou",
                                pick: "over",
                                line: totalLine ?? null,
                                selection:
                                  typeof totalLine === "number"
                                    ? `Over ${totalLine}`
                                    : "Over",
                              })
                            }
                            className={pickCell(ouPick?.pick === "over", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              Over
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {typeof totalLine === "number"
                                ? `O ${totalLine}`
                                : "—"}
                            </div>
                          </button>

                          <button
                            disabled={closed || savingKey === `${gameKey}:ou`}
                            onClick={() =>
                              handlePick({
                                g,
                                market: "ou",
                                pick: "under",
                                line: totalLine ?? null,
                                selection:
                                  typeof totalLine === "number"
                                    ? `Under ${totalLine}`
                                    : "Under",
                              })
                            }
                            className={pickCell(ouPick?.pick === "under", closed)}
                          >
                            <div className="text-sm font-semibold text-white">
                              Under
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {typeof totalLine === "number"
                                ? `U ${totalLine}`
                                : "—"}
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Protected>
  );
}