"use client";

import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { getWeekId } from "@/lib/week";
import FreePicksAdmin from "@/components/free-picks-admin";
type Sport = "NBA" | "MLB";

export default function AdminPage() {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [syncingNBA, setSyncingNBA] = useState(false);
  const [syncingMLB, setSyncingMLB] = useState(false);
  const [syncingMLBProps, setSyncingMLBProps] = useState(false);
  const [recomputingNBA, setRecomputingNBA] = useState(false);
  const [recomputingMLB, setRecomputingMLB] = useState(false);
  const [recomputingSOCCER, setRecomputingSOCCER] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [finalizingNBA, setFinalizingNBA] = useState(false);
  const [finalizingMLB, setFinalizingMLB] = useState(false);
  const [repairingMLB, setRepairingMLB] = useState(false);
  const [repairingNBA, setRepairingNBA] = useState(false);
  const [backfillingDaily, setBackfillingDaily] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string | null>(null);
  const [quickBackfillingToday, setQuickBackfillingToday] = useState(false);
  const [migratingUsernames, setMigratingUsernames] = useState(false);
  const [backfillingLBEntries, setBackfillingLBEntries] = useState(false);
  const [finalizingDailyNBA, setFinalizingDailyNBA] = useState(false);
  const [finalizingDailyMLB, setFinalizingDailyMLB] = useState(false);
  const [finalizeDayId, setFinalizeDayId] = useState<string>("");
  const [finalizeDailySport, setFinalizeDailySport] = useState<"ALL" | "NBA" | "MLB">("ALL");

  const defaultWeekId = useMemo(() => getWeekId(new Date()), []);
  const lastWeekId = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getWeekId(d);
  }, []);
  const yesterdayId = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, []);
  const todayId = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, []);

  const [weekIdNBA, setWeekIdNBA] = useState<string>(defaultWeekId);
  const [weekIdMLB, setWeekIdMLB] = useState<string>(defaultWeekId);
  const [weekIdSOCCER, setWeekIdSOCCER] = useState<string>(defaultWeekId);
  const [rescoreSport, setRescoreSport] = useState<Sport>("NBA");
  const [rescoreWeekId, setRescoreWeekId] = useState<string>(defaultWeekId);
  const [rescoreGameId, setRescoreGameId] = useState<string>("");
  const [finalizeWeekIdNBA, setFinalizeWeekIdNBA] =
    useState<string>(lastWeekId);
  const [finalizeWeekIdMLB, setFinalizeWeekIdMLB] =
    useState<string>(lastWeekId);
    const [finalizeWeekIdSOCCER, setFinalizeWeekIdSOCCER] = useState<string>(lastWeekId);
const [finalizingSOCCER, setFinalizingSOCCER] = useState(false);
  const [repairWeekIdMLB, setRepairWeekIdMLB] = useState<string>(defaultWeekId);
  const [repairWeekIdNBA, setRepairWeekIdNBA] = useState<string>(defaultWeekId);
  const [backfillDayId, setBackfillDayId] = useState<string>("");
  const [backfillSport, setBackfillSport] = useState<"ALL" | "NBA" | "MLB">("ALL");

  const functions = useMemo(() => getFunctions(getApp()), []);

  const syncNBAGamesNow = useMemo(
    () => httpsCallable(functions, "syncNBAGamesNow"),
    [functions],
  );
  const syncMLBGamesNow = useMemo(
    () => httpsCallable(functions, "syncMLBGamesNow"),
    [functions],
  );
  const syncMlbPlayerPropsNow = useMemo(
    () => httpsCallable(functions, "syncMlbPlayerPropsNow"),
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
  const adminRecomputeSOCCERWeek = useMemo(
    () => httpsCallable(functions, "adminRecomputeSOCCERWeek"),
    [functions],
  );
  const adminRescoreGame = useMemo(
    () => httpsCallable(functions, "adminRescoreGame"),
    [functions],
  );
  const adminFinalizeWeeklyRewards = useMemo(
    () => httpsCallable(functions, "adminFinalizeWeeklyRewards"),
    [functions],
  );
  const adminRepairStaleMLBGames = useMemo(
    () => httpsCallable(functions, "adminRepairStaleMLBGames"),
    [functions],
  );
  const adminRepairStaleNBAGames = useMemo(
    () => httpsCallable(functions, "adminRepairStaleNBAGames"),
    [functions],
  );
  const adminBackfillDailyPicks = useMemo(
    () => httpsCallable(functions, "adminBackfillDailyPicks"),
    [functions],
  );
  const adminFinalizeDailyRewards = useMemo(
    () => httpsCallable(functions, "adminFinalizeDailyRewards"),
    [functions],
  );
  const adminBackfillDailyPicksFn = useMemo(
    () => httpsCallable(functions, "adminBackfillDailyPicks"),
    [functions],
  );
  const adminMigrateUsernamesFn = useMemo(
    () => httpsCallable(functions, "adminMigrateUsernames"),
    [functions],
  );
  const adminBackfillLBEntriesFn = useMemo(
    () => httpsCallable(functions, "adminBackfillLeaderboardEntries"),
    [functions],
  );
  const syncSoccerGamesNow = useMemo(
    () => httpsCallable(functions, "syncSoccerGamesNow"),
    [functions],
  );
  const adminMigrateUsernames = useMemo(
    () => httpsCallable(functions, "adminMigrateUsernames"),
    [functions],
  );

  async function handleFinalizeDailyRewards() {
    const d = (finalizeDayId || yesterdayId).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setErr('DayId inválido. Debe ser "YYYY-MM-DD".');
      return;
    }
    const setter = finalizeDailySport === "MLB" ? setFinalizingDailyMLB : setFinalizingDailyNBA;
    setter(true);
    resetMessages();
    try {
      const res = await adminFinalizeDailyRewards({ dayId: d, sport: finalizeDailySport, force: true }) as any;
      const { results } = res.data ?? {};
      const summary = Object.entries(results ?? {})
        .map(([s, r]: any) => `${s}: ${r?.skipped ? "ya finalizado" : `${r?.rewarded ?? 0} premiados / ${r?.totalPlayers ?? 0} jugadores`}`)
        .join(" | ");
      setMsg(`✅ Daily Rewards OK — Día: ${d} | ${summary}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setFinalizingDailyNBA(false);
      setFinalizingDailyMLB(false);
    }
  }

  async function handleBackfillDaily() {
    const d = (backfillDayId || yesterdayId).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setErr('DayId inválido. Debe ser "YYYY-MM-DD", ej: "2026-04-06".');
      return;
    }
    setBackfillingDaily(true);
    setBackfillProgress(null);
    resetMessages();
    try {
      setBackfillProgress(`Resolviendo picks del ${d} (${backfillSport})...`);
      const res = await adminBackfillDailyPicks({ dayId: d, sport: backfillSport }) as any;
      const { resolved, skipped, message } = res.data ?? {};
      setBackfillProgress(null);
      setMsg(
        `✅ Daily Backfill OK — Día: ${d} | Sport: ${backfillSport} | Resueltos: ${resolved ?? 0} | Saltados: ${skipped ?? 0}${message ? " | " + message : ""}`
      );
    } catch (e: any) {
      setBackfillProgress(null);
      setErr(getCallableError(e));
    } finally {
      setBackfillingDaily(false);
    }
  }

  const [syncingSoccer, setSyncingSoccer] = useState(false);

  async function handleSyncSoccer() {
    setSyncingSoccer(true);
    resetMessages();
    try {
      const res = await syncSoccerGamesNow({});
      setMsg(`✅ Soccer Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setSyncingSoccer(false);
    }
  }

  async function handleQuickBackfillToday() {
    setQuickBackfillingToday(true);
    resetMessages();
    try {
      const [nbaRes, mlbRes] = await Promise.all([
        adminBackfillDailyPicksFn({ dayId: todayId, sport: "NBA" }),
        adminBackfillDailyPicksFn({ dayId: todayId, sport: "MLB" }),
      ]) as any[];
      const nba = nbaRes.data ?? {};
      const mlb = mlbRes.data ?? {};
      setMsg(
        `✅ Today Backfill (${todayId}) — NBA: ${nba.resolved ?? 0} resolved, ${nba.skipped ?? 0} skipped | MLB: ${mlb.resolved ?? 0} resolved, ${mlb.skipped ?? 0} skipped`
      );
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setQuickBackfillingToday(false);
    }
  }

  async function handleBackfillLBEntries() {
    setBackfillingLBEntries(true);
    resetMessages();
    try {
      const res = await adminBackfillLBEntriesFn({}) as any;
      const { created, skipped, total } = res.data ?? {};
      setMsg(`✅ Leaderboard entries backfilled — Total registrations: ${total} | Created: ${created} | Skipped: ${skipped}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setBackfillingLBEntries(false);
    }
  }

  async function handleMigrateUsernames() {
    setMigratingUsernames(true);
    resetMessages();
    try {
      const res = await adminMigrateUsernamesFn({}) as any;
      const { created, skipped, conflicts, total } = res.data ?? {};
      setMsg(
        `✅ Usernames migrated — Total: ${total} | Created: ${created} | Skipped: ${skipped} | Conflicts: ${conflicts}`
      );
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setMigratingUsernames(false);
    }
  }

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
    } finally {
      setSyncingMLB(false);
    }
  }

  async function handleSyncMLBProps() {
    setSyncingMLBProps(true);
    resetMessages();
    try {
      const res = await syncMlbPlayerPropsNow({});
      setMsg(`✅ MLB Props Sync OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setSyncingMLBProps(false);
    }
  }

  async function handleRecomputeNBA() {
    setRecomputingNBA(true);
    resetMessages();
    const w = (weekIdNBA ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId NBA inválido. Debe ser "2026-W10".');
      setRecomputingNBA(false);
      return;
    }
    try {
      const res = await adminRecomputeNBAWeek({ weekId: w });
      setMsg(`✅ NBA Recompute OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setRecomputingNBA(false);
    }
  }

  async function handleRecomputeMLB() {
    setRecomputingMLB(true);
    resetMessages();
    const w = (weekIdMLB ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId MLB inválido. Debe ser "2026-W10".');
      setRecomputingMLB(false);
      return;
    }
    try {
      const res = await adminRecomputeMLBWeek({ weekId: w });
      setMsg(`✅ MLB Recompute OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setRecomputingMLB(false);
    }
  }

async function handleRecomputeSOCCER() {
  setRecomputingSOCCER(true);
  resetMessages();
  const w = (weekIdSOCCER ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(w)) {
    setErr('WeekId Soccer inválido. Debe ser "2026-W15".');
    setRecomputingSOCCER(false);
    return;
  }
  try {
    const res = await adminRecomputeSOCCERWeek({ weekId: w });
    setMsg(`✅ Soccer Recompute OK: ${JSON.stringify(res.data)}`);
  } catch (e: any) {
    setErr(getCallableError(e));
  } finally {
    setRecomputingSOCCER(false);
  }
}


  

  async function handleRescoreGame() {
    setRescoring(true);
    resetMessages();
    const w = (rescoreWeekId ?? "").trim();
    const g = (rescoreGameId ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser "2026-W10".');
      setRescoring(false);
      return;
    }
    if (!g) {
      setErr("GameId es requerido.");
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
    } finally {
      setRescoring(false);
    }
  }

  async function handleFinalizeNBA() {
    setFinalizingNBA(true);
    resetMessages();
    const w = (finalizeWeekIdNBA ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser "2026-W13".');
      setFinalizingNBA(false);
      return;
    }
    try {
      const res = await adminFinalizeWeeklyRewards({
        sport: "NBA",
        weekId: w,
        force: true,
      });
      setMsg(`✅ NBA Weekly Rewards OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setFinalizingNBA(false);
    }
  }

  async function handleFinalizeMLB() {
    setFinalizingMLB(true);
    resetMessages();
    const w = (finalizeWeekIdMLB ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser "2026-W13".');
      setFinalizingMLB(false);
      return;
    }
    try {
      const res = await adminFinalizeWeeklyRewards({
        sport: "MLB",
        weekId: w,
        force: true,
      });
      setMsg(`✅ MLB Weekly Rewards OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setFinalizingMLB(false);
    }
  }

async function handleFinalizeSOCCER() {
  setFinalizingSOCCER(true);
  resetMessages();
  const w = (finalizeWeekIdSOCCER ?? "").trim();
  if (!/^\d{4}-W\d{2}$/.test(w)) {
    setErr('WeekId inválido. Debe ser "2026-W13".');
    setFinalizingSOCCER(false);
    return;
  }
  try {
    const res = await adminFinalizeWeeklyRewards({
      sport: "SOCCER",
      weekId: w,
      force: true,
    });
    setMsg(`✅ Soccer Weekly Rewards OK: ${JSON.stringify(res.data)}`);
  } catch (e: any) {
    setErr(getCallableError(e));
  } finally {
    setFinalizingSOCCER(false);
  }
}



  async function handleRepairMLB() {
    setRepairingMLB(true);
    resetMessages();
    const w = (repairWeekIdMLB ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser "2026-W14".');
      setRepairingMLB(false);
      return;
    }
    try {
      const res = await adminRepairStaleMLBGames({ weekId: w });
      setMsg(`✅ MLB Repair OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setRepairingMLB(false);
    }
  }

  async function handleRepairNBA() {
    setRepairingNBA(true);
    resetMessages();
    const w = (repairWeekIdNBA ?? "").trim();
    if (!/^\d{4}-W\d{2}$/.test(w)) {
      setErr('WeekId inválido. Debe ser "2026-W14".');
      setRepairingNBA(false);
      return;
    }
    try {
      const res = await adminRepairStaleNBAGames({ weekId: w });
      setMsg(`✅ NBA Repair OK: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setErr(getCallableError(e));
    } finally {
      setRepairingNBA(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20";
  const btnCls =
    "rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-60";

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin · Games</h1>
        <p className="mt-1 text-sm text-white/60">
          Sync manual, repair de juegos stale, re-score y recompute de
          leaderboards.
        </p>
      </div>

      {err && (
        <div className="mb-4 break-words whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-4 break-words whitespace-pre-wrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      )}
      <FreePicksAdmin />
      {/* ── Migrate Usernames (run once) ── */}
      <div className="mb-5 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-violet-200">👤 Migrate Usernames — Run Once</div>
          <div className="text-xs text-white/50 mt-0.5">
            Crea docs en la colección <code className="text-violet-300">usernames</code> para todos los usuarios existentes.
            Corre una sola vez para backfill. Los nuevos usuarios se crean automáticamente.
          </div>
        </div>
        <button
          onClick={handleMigrateUsernames}
          disabled={migratingUsernames}
          className="flex-shrink-0 rounded-xl border border-violet-400/30 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-60 transition"
        >
          {migratingUsernames ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
              Migrando…
            </span>
          ) : "🔄 Migrate Usernames"}
        </button>
      </div>

      {/* ── Quick Actions ── */}
      <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-amber-200">⚡ Quick Backfill — Today ({todayId})</div>
          <div className="text-xs text-white/50 mt-0.5">
            Resuelve todos los picks pendientes de hoy (NBA + MLB). Úsalo cuando los picks no se resuelven automáticamente.
          </div>
        </div>
        <button
          onClick={handleQuickBackfillToday}
          disabled={quickBackfillingToday}
          className="flex-shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/15 px-5 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-60 transition"
        >
          {quickBackfillingToday ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
              Procesando…
            </span>
          ) : "🎯 Backfill Today Now"}
        </button>
      </div>

      {/* ── Migrate Usernames (run once) ── */}
      <div className="mb-5 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-violet-200">👤 Migrate Usernames — Run Once</div>
          <div className="text-xs text-white/50 mt-0.5">
            Crea docs en la colección <code className="text-violet-300/80">usernames</code> para todos los usuarios existentes. Los nuevos usuarios se crean automáticamente.
          </div>
        </div>
        <button
          onClick={handleMigrateUsernames}
          disabled={migratingUsernames}
          className="flex-shrink-0 rounded-xl border border-violet-400/30 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-60 transition"
        >
          {migratingUsernames ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
              Migrando…
            </span>
          ) : "🔄 Migrate Usernames"}
        </button>
      </div>

      {/* ── Backfill Leaderboard Entries ── */}
      <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-blue-200">📊 Backfill Leaderboard Entries</div>
          <div className="text-xs text-white/50 mt-0.5">
            Crea entries en el leaderboard para usuarios que se unieron a torneos antes del fix.
            Safe to run multiple times — nunca sobreescribe puntos existentes.
          </div>
        </div>
        <button
          onClick={handleBackfillLBEntries}
          disabled={backfillingLBEntries}
          className="flex-shrink-0 rounded-xl border border-blue-400/30 bg-blue-500/15 px-5 py-2.5 text-sm font-semibold text-blue-200 hover:bg-blue-500/25 disabled:opacity-60 transition"
        >
          {backfillingLBEntries ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
              Procesando…
            </span>
          ) : "📊 Fix Leaderboard Entries"}
        </button>
      </div>

      {/* Manual Sync */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-4">
          <div className="text-lg font-semibold">Manual Sync</div>
          <div className="text-sm text-white/60">
            Corre sync completo de schedule, odds y scores sin esperar los cron
            jobs.
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">NBA</div>
            <div className="mb-4 text-sm text-white/60">
              Sync manual de schedule, odds y scores NBA.
            </div>
            <button
              onClick={handleSyncNBA}
              disabled={syncingNBA}
              className={btnCls}
            >
              {syncingNBA ? "Syncing NBA..." : "Sync NBA Now"}
            </button>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">MLB</div>
            <div className="mb-4 text-sm text-white/60">
              Sync manual de schedule, odds y scores MLB.
            </div>
            <button
              onClick={handleSyncMLB}
              disabled={syncingMLB}
              className={btnCls}
            >
              {syncingMLB ? "Syncing MLB..." : "Sync MLB Now"}
            </button>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">⚽ Soccer</div>
            <div className="mb-4 text-sm text-white/60">
              Sync de events, odds y scores de las 6 ligas de Soccer.
            </div>
            <button
              onClick={handleSyncSoccer}
              disabled={syncingSoccer}
              className={btnCls}
            >
              {syncingSoccer ? "Syncing Soccer..." : "Sync Soccer Now"}
            </button>
          </div>
        </div>
      </div>

      {/* ⚾ Mixed Tournaments — MLB Player Props */}
      <div className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5">
        <div className="mb-4">
          <div className="text-lg font-semibold text-sky-200">
            ⚾ Mixed Tournaments — MLB Player Props
          </div>
          <div className="text-sm text-white/60">
            Sync de juegos + player props (pitcher & batter) para el torneo{" "}
            <span className="font-semibold text-sky-300">MLB Game + Player Props</span>.
            Separado del torneo regular de MLB. Escribe en{" "}
            <code className="text-white/70">player_props_games</code>.
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-black/20 p-4 max-w-sm">
          <div className="mb-2 text-base font-semibold">⚾ MLB Props</div>
          <div className="mb-4 text-sm text-white/60">
            Sincroniza juegos de mañana con líneas (ML · Spread · O/U) y props del
            pitcher abridor y bateador estrella de cada juego.
          </div>
          <button
            onClick={handleSyncMLBProps}
            disabled={syncingMLBProps}
            className={btnCls}
          >
            {syncingMLBProps ? "Syncing Props..." : "⚾ Sync MLB Player Props Now"}
          </button>
        </div>
      </div>
      <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <div className="mb-4">
          <div className="text-lg font-semibold text-red-200">
            🔧 Repair Stale Games
          </div>
          <div className="text-sm text-white/60">
            Repara juegos que quedaron stuck en{" "}
            <span className="text-white/80">inprogress</span> sin score.
            Consulta la API oficial (NBA/MLB Stats) y actualiza status y scores
            automáticamente.
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-red-500/20 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">NBA</div>
            <div className="mb-3 text-sm text-white/60">
              Busca juegos NBA stuck en inprogress y los repara contra la NBA
              official API.
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/60">WeekId</label>
              <input
                value={repairWeekIdNBA}
                onChange={(e) => setRepairWeekIdNBA(e.target.value)}
                className={inputCls}
                placeholder='Ej: "2026-W14"'
              />
            </div>
            <button
              onClick={handleRepairNBA}
              disabled={repairingNBA}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-60"
            >
              {repairingNBA ? "Repairing..." : "🔧 Repair NBA Stale Games"}
            </button>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">MLB</div>
            <div className="mb-3 text-sm text-white/60">
              Busca juegos MLB stuck en inprogress y los repara contra la MLB
              Stats API.
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/60">WeekId</label>
              <input
                value={repairWeekIdMLB}
                onChange={(e) => setRepairWeekIdMLB(e.target.value)}
                className={inputCls}
                placeholder='Ej: "2026-W14"'
              />
            </div>
            <button
              onClick={handleRepairMLB}
              disabled={repairingMLB}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-60"
            >
              {repairingMLB ? "Repairing..." : "🔧 Repair MLB Stale Games"}
            </button>
          </div>
        </div>
      </div>

      {/* 🏆 Weekly Rewards */}
      <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
        <div className="mb-4">
          <div className="text-lg font-semibold text-amber-200">
            🏆 Weekly Rewards
          </div>
          <div className="text-sm text-white/60">
            Da los reward points semanales al top 10 y al ganador del torneo.
            Default: semana pasada.
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">NBA</div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/60">WeekId</label>
              <input
                value={finalizeWeekIdNBA}
                onChange={(e) => setFinalizeWeekIdNBA(e.target.value)}
                className={inputCls}
                placeholder='Ej: "2026-W13"'
              />
            </div>
            <button
              onClick={handleFinalizeNBA}
              disabled={finalizingNBA}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
            >
              {finalizingNBA ? "Running..." : "🏆 Give NBA Weekly Rewards"}
            </button>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
            <div className="mb-2 text-base font-semibold">MLB</div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-white/60">WeekId</label>
              <input
                value={finalizeWeekIdMLB}
                onChange={(e) => setFinalizeWeekIdMLB(e.target.value)}
                className={inputCls}
                placeholder='Ej: "2026-W13"'
              />
            </div>
            <button
              onClick={handleFinalizeMLB}
              disabled={finalizingMLB}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
            >
              {finalizingMLB ? "Running..." : "🏆 Give MLB Weekly Rewards"}
            </button>
          </div>
        </div>
      </div>

<div className="rounded-xl border border-amber-500/20 bg-black/20 p-4">
  <div className="mb-2 text-base font-semibold">⚽ Soccer</div>
  <div className="mb-3">
    <label className="mb-1 block text-xs text-white/60">WeekId</label>
    <input
      value={finalizeWeekIdSOCCER}
      onChange={(e) => setFinalizeWeekIdSOCCER(e.target.value)}
      className={inputCls}
      placeholder='Ej: "2026-W13"'
    />
  </div>
  <button
    onClick={handleFinalizeSOCCER}
    disabled={finalizingSOCCER}
    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
  >
    {finalizingSOCCER ? "Running..." : "🏆 Give Soccer Weekly Rewards"}
  </button>
</div>


      {/* Re-score Game */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Re-score Game</div>
            <div className="text-sm text-white/60">
              Vuelve a resolver picks de un juego final sin tocar Firestore
              manualmente.
            </div>
          </div>
          <button
            onClick={handleRescoreGame}
            disabled={rescoring}
            className={btnCls}
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
              className={inputCls}
              placeholder='Ej: "2026-W10"'
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">GameId</label>
            <input
              value={rescoreGameId}
              onChange={(e) => setRescoreGameId(e.target.value)}
              className={inputCls}
              placeholder='Ej: "c61d2594de00eb4d12ba96127dc437e5"'
            />
          </div>
        </div>
      </div>

      {/* 🎯 Daily Picks Backfill */}
      <div className="mb-6 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎯</span>
              <div className="text-lg font-semibold text-sky-200">Daily Picks Backfill</div>
            </div>
            <div className="text-sm text-white/60">
              Resuelve todos los picks diarios <span className="text-white/80 font-medium">pending</span> de un día específico.
              Úsalo para días anteriores donde los juegos ya terminaron pero los picks no se resolvieron.
            </div>
          </div>
          {backfillProgress && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/8 px-3 py-1.5 text-xs text-sky-300 whitespace-nowrap">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              {backfillProgress}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">DayId</label>
            <input
              value={backfillDayId}
              onChange={(e) => setBackfillDayId(e.target.value)}
              className={inputCls}
              placeholder={`Ej: "${yesterdayId}" (ayer)`}
            />
            <div className="mt-1 text-[10px] text-white/30">Dejar vacío para usar ayer ({yesterdayId})</div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Sport</label>
            <select
              value={backfillSport}
              onChange={(e) => setBackfillSport(e.target.value as "ALL" | "NBA" | "MLB")}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="ALL">ALL (NBA + MLB)</option>
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleBackfillDaily}
              disabled={backfillingDaily}
              className="w-full rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-60 transition-all"
            >
              {backfillingDaily ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                  Procesando...
                </span>
              ) : (
                "🎯 Run Daily Backfill"
              )}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/10 bg-black/20 px-4 py-3 text-xs text-white/40">
          <span className="font-semibold text-white/60">¿Cuándo usar esto?</span>{" "}
          Cuando el leaderboard diario muestra 0 puntos porque los picks quedaron en "pending".
          Esta función busca el juego final en <code className="text-sky-300/70">games</code> y calcula el resultado correctamente.
        </div>
      </div>

      {/* 🏅 Daily Rewards */}
      <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🏅</span>
            <div className="text-lg font-semibold text-emerald-200">Daily Rewards</div>
          </div>
          <div className="text-sm text-white/60">
            Da los reward points del torneo diario al top 10. Se corre automáticamente a las 11:55 PM PR cada día.
            Usa esto para días anteriores o para forzar re-cálculo.
          </div>
        </div>

        {/* RP structure reminder */}
        <div className="mb-4 grid gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-xs text-white/50">
            <div className="font-semibold text-white/70 mb-1.5">Plan FREE</div>
            <div>Win × <span className="text-emerald-300">1 RP</span></div>
            <div>Push × <span className="text-white/40">0 RP</span></div>
            <div>Top 10 bonus: <span className="text-amber-300">+3 RP</span></div>
            <div>#1 Winner: <span className="text-amber-300">+25 RP</span></div>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-xs text-white/50">
            <div className="font-semibold text-amber-300/80 mb-1.5">Plan PREMIUM</div>
            <div>Win × <span className="text-emerald-300">5 RP</span></div>
            <div>Push × <span className="text-emerald-300/60">1 RP</span></div>
            <div>Top 10 bonus: <span className="text-amber-300">+5 RP</span></div>
            <div>#1 Winner: <span className="text-amber-300">+50 RP</span></div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-white/60">DayId</label>
            <input
              value={finalizeDayId}
              onChange={(e) => setFinalizeDayId(e.target.value)}
              className={inputCls}
              placeholder={`Ej: "${yesterdayId}" (ayer)`}
            />
            <div className="mt-1 text-[10px] text-white/30">Dejar vacío para usar ayer ({yesterdayId})</div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Sport</label>
            <select
              value={finalizeDailySport}
              onChange={(e) => setFinalizeDailySport(e.target.value as "ALL" | "NBA" | "MLB")}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="ALL">ALL (NBA + MLB)</option>
              <option value="NBA">NBA</option>
              <option value="MLB">MLB</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFinalizeDailyRewards}
              disabled={finalizingDailyNBA || finalizingDailyMLB}
              className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60 transition-all"
            >
              {(finalizingDailyNBA || finalizingDailyMLB) ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                  Procesando...
                </span>
              ) : (
                "🏅 Give Daily Rewards"
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-emerald-500/10 bg-black/20 px-4 py-3 text-xs text-white/40">
          <span className="font-semibold text-white/60">Nota:</span>{" "}
          Usa <code className="text-emerald-300/70">force: true</code> automáticamente para re-calcular días ya finalizados.
          Los picks deben estar resueltos (usa <span className="text-sky-300/70">Daily Backfill</span> primero si hay picks pending).
        </div>
      </div>


<div className="rounded-xl border border-white/10 bg-black/20 p-4">
  <div className="mb-2 text-base font-semibold">⚽ Soccer</div>
  <div className="mb-3">
    <label className="mb-1 block text-xs text-white/60">WeekId</label>
    <input
      value={weekIdSOCCER}
      onChange={(e) => setWeekIdSOCCER(e.target.value)}
      className={inputCls}
      placeholder='Ej: "2026-W15"'
    />
  </div>
  <button
    onClick={handleRecomputeSOCCER}
    disabled={recomputingSOCCER}
    className={btnCls}
  >
    {recomputingSOCCER ? "Running..." : "Run Soccer Recompute"}
  </button>
</div>



      {/* Recompute Points */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">
                Recompute Points (NBA)
              </div>
              <div className="text-sm text-white/60">
                Recalcula puntos de una semana y actualiza leaderboards NBA.
              </div>
            </div>
            <button
              onClick={handleRecomputeNBA}
              disabled={recomputingNBA}
              className={btnCls}
            >
              {recomputingNBA ? "Running..." : "Run NBA Recompute"}
            </button>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-white/60">WeekId</label>
            <input
              value={weekIdNBA}
              onChange={(e) => setWeekIdNBA(e.target.value)}
              className={inputCls}
              placeholder='Ej: "2026-W10"'
            />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">
                Recompute Points (MLB)
              </div>
              <div className="text-sm text-white/60">
                Recalcula puntos de una semana y actualiza leaderboards MLB.
              </div>
            </div>
            <button
              onClick={handleRecomputeMLB}
              disabled={recomputingMLB}
              className={btnCls}
            >
              {recomputingMLB ? "Running..." : "Run MLB Recompute"}
            </button>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-white/60">WeekId</label>
            <input
              value={weekIdMLB}
              onChange={(e) => setWeekIdMLB(e.target.value)}
              className={inputCls}
              placeholder='Ej: "2026-W10"'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
