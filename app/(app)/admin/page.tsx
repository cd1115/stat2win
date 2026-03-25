"use client";

import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { getWeekId } from "@/lib/week";

export default function AdminPage() {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [rescoring, setRescoring] = useState(false);

  const defaultWeekId = useMemo(() => getWeekId(new Date()), []);
  const [weekId, setWeekId] = useState<string>(defaultWeekId);
  const [rescoreWeekId, setRescoreWeekId] = useState<string>(defaultWeekId);
  const [rescoreGameId, setRescoreGameId] = useState<string>("");

  const functions = useMemo(() => getFunctions(getApp()), []);
  const syncNBAGamesNow = useMemo(
    () => httpsCallable(functions, "syncNBAGamesNow"),
    [functions],
  );
  const adminRecomputeNBAWeek = useMemo(
    () => httpsCallable(functions, "adminRecomputeNBAWeek"),
    [functions],
  );
  const adminRescoreGame = useMemo(
    () => httpsCallable(functions, "adminRescoreGame"),
    [functions],
  );

  function getCallableError(e: any): string {
    const code = e?.code ? String(e.code) : "";
    const message = e?.message ? String(e.message) : "";
    const details =
      typeof e?.details === "string"
        ? e.details
        : e?.details
          ? JSON.stringify(e.details)
          : "";

    return (
      [code, message, details].filter(Boolean).join(" | ") || "Unknown error"
    );
  }

  async function handleSyncNow() {
    setSyncing(true);
    setErr(null);
    setMsg(null);

    try {
      const res = await syncNBAGamesNow();
      setMsg(`✅ Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("syncNBAGamesNow error:", e);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setErr(null);
    setMsg(null);

    const w = (weekId ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser formato "2026-W10".');
      setRecomputing(false);
      return;
    }

    try {
      const res = await adminRecomputeNBAWeek({ weekId: w });
      setMsg(`✅ Recompute OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("adminRecomputeNBAWeek error:", e);
    } finally {
      setRecomputing(false);
    }
  }

  async function handleRescoreGame() {
    setRescoring(true);
    setErr(null);
    setMsg(null);

    const w = (rescoreWeekId ?? "").trim();
    const g = (rescoreGameId ?? "").trim();

    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser formato "2026-W10".');
      setRescoring(false);
      return;
    }

    if (!g) {
      setErr("GameId es requerido para hacer re-score.");
      setRescoring(false);
      return;
    }

    try {
      const res = await adminRescoreGame({
        sport: "NBA",
        weekId: w,
        gameId: g,
      });
      setMsg(`✅ Re-score OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("adminRescoreGame error:", e);
    } finally {
      setRescoring(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin · Games</h1>
          <p className="mt-1 text-sm text-white/60">
            Sync NBA desde Odds API, re-score por juego y recompute de puntos
            por semana.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync NBA Now"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-4 break-words whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {msg ? (
        <div className="mb-4 break-words whitespace-pre-wrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Re-score Game (NBA)</div>
            <div className="text-sm text-white/60">
              Vuelve a resolver picks de un juego final sin tocar Firestore
              manualmente.
            </div>
          </div>

          <button
            onClick={handleRescoreGame}
            disabled={rescoring}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
          >
            {rescoring ? "Running..." : "Run Re-score"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-white/60">WeekId</label>
            <input
              value={rescoreWeekId}
              onChange={(e) => setRescoreWeekId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              placeholder='Ej: "2026-W10"'
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">GameId</label>
            <input
              value={rescoreGameId}
              onChange={(e) => setRescoreGameId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              placeholder='Ej: "c61d2594de00eb4d12ba96127dc437e5"'
            />
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Recompute Points (NBA)</div>
            <div className="text-sm text-white/60">
              Recalcula puntos de una semana y actualiza leaderboards.
            </div>
          </div>

          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
          >
            {recomputing ? "Running..." : "Run Recompute"}
          </button>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs text-white/60">WeekId</label>
          <input
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
            placeholder='Ej: "2026-W10"'
          />
        </div>
      </div>
    </div>
  );
}
