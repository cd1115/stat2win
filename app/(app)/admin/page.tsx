"use client";

import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { getWeekId } from "@/lib/week";

type Sport = "NBA" | "MLB";

export default function AdminPage() {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [syncingNBA, setSyncingNBA] = useState(false);
  const [syncingMLB, setSyncingMLB] = useState(false);
  const [recomputingNBA, setRecomputingNBA] = useState(false);
  const [recomputingMLB, setRecomputingMLB] = useState(false);
  const [rescoring, setRescoring] = useState(false);

  const defaultWeekId = useMemo(() => getWeekId(new Date()), []);
  const [weekIdNBA, setWeekIdNBA] = useState<string>(defaultWeekId);
  const [weekIdMLB, setWeekIdMLB] = useState<string>(defaultWeekId);
  const [rescoreSport, setRescoreSport] = useState<Sport>("NBA");
  const [rescoreWeekId, setRescoreWeekId] = useState<string>(defaultWeekId);
  const [rescoreGameId, setRescoreGameId] = useState<string>("");

  const functions = useMemo(() => getFunctions(getApp()), []);

  const syncNBAGamesNow = useMemo(
    () => httpsCallable(functions, "syncNBAGamesNow"),
    [functions],
  );
  const syncMLBGamesNow = useMemo(
    () => httpsCallable(functions, "syncMLBGamesNow"),
    [functions],
  );
  const adminRecomputeNBAWeek = useMemo(
    () => httpsCallable(functions, "adminRecomputeNBAWeek"),
    [functions],
  );
  const adminRecomputeMLBWeek = useMemo(
    () => httpsCallable(functions, "adminRecomputeMLBWeek"),
    [functions],
  );
  const adminRescoreGame = useMemo(
    () => httpsCallable(functions, "adminRescoreGame"),
    [functions],
  );

  function resetMessages() {
    setErr(null);
    setMsg(null);
  }

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

  async function handleSyncNBA() {
    setSyncingNBA(true);
    resetMessages();

    try {
      const res = await syncNBAGamesNow({});
      setMsg(`✅ NBA Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("syncNBAGamesNow error:", e);
    } finally {
      setSyncingNBA(false);
    }
  }

  async function handleSyncMLB() {
    setSyncingMLB(true);
    resetMessages();

    try {
      const res = await syncMLBGamesNow({});
      setMsg(`✅ MLB Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("syncMLBGamesNow error:", e);
    } finally {
      setSyncingMLB(false);
    }
  }

  async function handleRecomputeNBA() {
    setRecomputingNBA(true);
    resetMessages();

    const w = (weekIdNBA ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId NBA inválido. Debe ser formato "2026-W10".');
      setRecomputingNBA(false);
      return;
    }

    try {
      const res = await adminRecomputeNBAWeek({ weekId: w });
      setMsg(`✅ NBA Recompute OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("adminRecomputeNBAWeek error:", e);
    } finally {
      setRecomputingNBA(false);
    }
  }

  async function handleRecomputeMLB() {
    setRecomputingMLB(true);
    resetMessages();

    const w = (weekIdMLB ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId MLB inválido. Debe ser formato "2026-W10".');
      setRecomputingMLB(false);
      return;
    }

    try {
      const res = await adminRecomputeMLBWeek({ weekId: w });
      setMsg(`✅ MLB Recompute OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
      console.error("adminRecomputeMLBWeek error:", e);
    } finally {
      setRecomputingMLB(false);
    }
  }

  async function handleRescoreGame() {
    setRescoring(true);
    resetMessages();

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
        sport: rescoreSport,
        weekId: w,
        gameId: g,
      });
      setMsg(`✅ ${rescoreSport} Re-score OK: ${JSON.stringify(res.data)}`);
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
            Sync manual para NBA y MLB, re-score por juego y recompute de
            leaderboards por semana.
          </p>
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
        <div className="mb-4">
          <div className="text-lg font-semibold">Manual Sync</div>
          <div className="text-sm text-white/60">
            Corre sync completo de schedule, odds y scores sin esperar los cron jobs.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">NBA</div>
            <div className="mb-4 text-sm text-white/60">
              Ejecuta sync manual para schedule, odds y scores NBA.
            </div>
            <button
              onClick={handleSyncNBA}
              disabled={syncingNBA}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
            >
              {syncingNBA ? "Syncing NBA..." : "Sync NBA Now"}
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">MLB</div>
            <div className="mb-4 text-sm text-white/60">
              Ejecuta sync manual para schedule, odds y scores MLB.
            </div>
            <button
              onClick={handleSyncMLB}
              disabled={syncingMLB}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
            >
              {syncingMLB ? "Syncing MLB..." : "Sync MLB Now"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Re-score Game</div>
            <div className="text-sm text-white/60">
              Vuelve a resolver picks de un juego final sin tocar Firestore manualmente.
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

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-white/60">Sport</label>
            <select
              value={rescoreSport}
              onChange={(e) => setRescoreSport(e.target.value as Sport)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
            </select>
          </div>

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

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Recompute Points (NBA)</div>
              <div className="text-sm text-white/60">
                Recalcula puntos de una semana y actualiza leaderboards NBA.
              </div>
            </div>

            <button
              onClick={handleRecomputeNBA}
              disabled={recomputingNBA}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
            >
              {recomputingNBA ? "Running..." : "Run NBA Recompute"}
            </button>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs text-white/60">WeekId</label>
            <input
              value={weekIdNBA}
              onChange={(e) => setWeekIdNBA(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              placeholder='Ej: "2026-W10"'
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Recompute Points (MLB)</div>
              <div className="text-sm text-white/60">
                Recalcula puntos de una semana y actualiza leaderboards MLB.
              </div>
            </div>

            <button
              onClick={handleRecomputeMLB}
              disabled={recomputingMLB}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60"
            >
              {recomputingMLB ? "Running..." : "Run MLB Recompute"}
            </button>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs text-white/60">WeekId</label>
            <input
              value={weekIdMLB}
              onChange={(e) => setWeekIdMLB(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
              placeholder='Ej: "2026-W10"'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
