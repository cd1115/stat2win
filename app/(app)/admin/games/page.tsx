"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

type GameStatus = "scheduled" | "inprogress" | "final" | string;

type GameDoc = {
  id: string;

  sport?: string;
  league?: string;
  weekId?: string;

  gameId?: string;
  matchKey?: string;
  oddsEventId?: string;

  homeTeam?: string;
  awayTeam?: string;

  startTime?: Timestamp;
  startAt?: Timestamp;
  status?: GameStatus;

  scoreHome?: number | null;
  scoreAway?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;

  updatedAt?: Timestamp;
  createdAt?: Timestamp;

  source?: string;
};

function tsToDate(ts?: Timestamp | null): Date | null {
  if (!ts) return null;
  try {
    return ts.toDate();
  } catch {
    return null;
  }
}

function getStartDate(g: GameDoc): Date | null {
  return tsToDate(g.startTime ?? null) ?? tsToDate((g as any).startAt ?? null);
}

function fmtStart(g: GameDoc) {
  const d = getStartDate(g);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getScores(g: GameDoc) {
  const hs =
    typeof g.scoreHome === "number"
      ? g.scoreHome
      : typeof g.homeScore === "number"
        ? g.homeScore
        : null;

  const as =
    typeof g.scoreAway === "number"
      ? g.scoreAway
      : typeof g.awayScore === "number"
        ? g.awayScore
        : null;

  const has = typeof hs === "number" && typeof as === "number";
  return { hs, as, has };
}

function statusBadge(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (s === "final")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (s === "inprogress") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-white/70";
}

function stableKey(g: GameDoc) {
  const k = (g.gameId ?? g.matchKey ?? g.oddsEventId ?? "").trim();
  return k.length > 0 ? k : "";
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameDoc[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const functions = useMemo(() => getFunctions(getApp()), []);
  const syncNBAGamesNow = useMemo(
    () => httpsCallable(functions, "syncNBAGamesNow"),
    [functions],
  );

  useEffect(() => {
    setErr(null);

    const q = query(
      collection(db, "games"),
      orderBy("startTime", "desc"),
      limit(200),
    );

    return onSnapshot(
      q,
      (snap) => {
        setGames(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (e) => setErr((e as any)?.message ?? String(e)),
    );
  }, []);

  const nbaGames = useMemo(() => {
    const rows = games.filter((g) => {
      const s = (g.sport ?? g.league ?? "").toUpperCase();
      return s === "NBA";
    });

    return rows.sort((a, b) => {
      const at = getStartDate(a)?.getTime() ?? 0;
      const bt = getStartDate(b)?.getTime() ?? 0;
      return bt - at;
    });
  }, [games]);

  async function handleSyncNow() {
    setSyncing(true);
    setErr(null);
    setMsg(null);

    try {
      const res = await syncNBAGamesNow();
      setMsg(`✅ Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : String(e));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Admin · NBA Games
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Sync manual (Odds API) y lista de juegos.
          </p>
        </div>

        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
        >
          {syncing ? "Syncing..." : "Sync NBA Now"}
        </button>
      </div>

      {err ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {msg ? (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-white/70">{nbaGames.length} game(s)</div>
          <div className="text-xs text-white/50">
            Últimos 200 docs (filtrado NBA)
          </div>
        </div>

        <div className="space-y-3">
          {nbaGames.map((g) => {
            const { hs, as, has } = getScores(g);
            const key = stableKey(g);

            return (
              <div
                key={g.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold">
                      {g.awayTeam ?? "—"}{" "}
                      <span className="text-white/40">@</span>{" "}
                      {g.homeTeam ?? "—"}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={[
                          "rounded-full border px-3 py-1",
                          statusBadge(g.status),
                        ].join(" ")}
                      >
                        {String(g.status ?? "scheduled")}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
                        {fmtStart(g)}
                      </span>

                      {has ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                          {g.awayTeam ?? "AWY"} {as}
                          <span className="text-white/40"> · </span>
                          {g.homeTeam ?? "HOM"} {hs}
                        </span>
                      ) : null}

                      {key ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/60">
                          key: <span className="text-white/80">{key}</span>
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-200">
                          Bad gameId
                        </span>
                      )}
                    </div>

                    {(g.matchKey || g.oddsEventId) && (
                      <div className="mt-2 text-xs text-white/50">
                        {g.matchKey ? (
                          <div>
                            matchKey:{" "}
                            <span className="text-white/70">{g.matchKey}</span>
                          </div>
                        ) : null}
                        {g.oddsEventId ? (
                          <div>
                            oddsEventId:{" "}
                            <span className="text-white/70">
                              {g.oddsEventId}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="text-right text-xs text-white/50">
                    <div>docId: {g.id}</div>
                    {g.weekId ? <div>weekId: {g.weekId}</div> : null}
                    {g.source ? <div>source: {g.source}</div> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {nbaGames.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            No NBA games found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
