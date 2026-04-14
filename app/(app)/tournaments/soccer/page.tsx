"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import { getDayId } from "@/lib/day";
import {
  collection, query, where, onSnapshot,
} from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

// ─── Types ────────────────────────────────────────────────────────────────────
type StatusTab  = "all" | "scheduled" | "inprogress" | "final";
type MarketTab  = "all" | "moneyline" | "spread" | "ou";
type SoccerSide = "home" | "away" | "draw" | "over" | "under";

interface LocalPick {
  market: MarketTab;
  pick:   SoccerSide;
  line?:  number | null;
}

// ─── League badge colors ──────────────────────────────────────────────────────
const LEAGUE_COLORS: Record<string, string> = {
  "EPL":              "bg-purple-500/15 text-purple-300 border-purple-500/25",
  "La Liga":          "bg-red-500/15 text-red-300 border-red-500/25",
  "Bundesliga":       "bg-red-600/15 text-red-400 border-red-600/25",
  "Serie A":          "bg-blue-600/15 text-blue-300 border-blue-600/25",
  "Ligue 1":          "bg-sky-500/15 text-sky-300 border-sky-500/25",
  "Champions League": "bg-amber-500/15 text-amber-300 border-amber-500/25",
};
function LeagueBadge({ league }: { league: string }) {
  const cls = LEAGUE_COLORS[league] ?? "bg-white/5 text-white/40 border-white/10";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {league}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtStart(ts: any) {
  try {
    const d: Date = ts?.toDate?.() instanceof Date ? ts.toDate()
      : ts instanceof Date ? ts
      : typeof ts === "number" ? new Date(ts) : null;
    if (!d) return "";
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

function isClosed(g: any) { return g.status === "inprogress" || g.status === "final"; }

function stableGameKey(g: any): string {
  const c = g?.gameId ?? g?.oddsEventId ?? null;
  if (typeof c === "string" && c.trim() && !/^\d{13}$/.test(c.trim())) return c.trim();
  return "";
}

function getSpread(g: any) {
  const sp = g?.markets?.spread ?? g?.markets?.sp ?? null;
  const homeLine = typeof sp?.homeLine === "number" ? sp.homeLine : typeof sp?.line === "number" ? sp.line : null;
  const awayLine = typeof sp?.awayLine === "number" ? sp.awayLine : typeof homeLine === "number" ? -homeLine : null;
  return { homeLine, awayLine };
}

function getTotal(g: any) {
  const t = g?.markets?.total ?? g?.markets?.ou ?? null;
  return { line: typeof t?.line === "number" ? t.line : null };
}

function showLine(n: number | null) {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

function badgeBase() { return "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"; }

function pickCell(active: boolean, disabled: boolean) {
  if (disabled) return "rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-center opacity-40 cursor-not-allowed text-sm";
  return [
    "rounded-xl border px-3 py-2.5 text-center transition cursor-pointer text-sm font-semibold",
    active
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/25"
      : "border-white/10 bg-black/20 text-white/80 hover:bg-white/8 hover:border-white/20",
  ].join(" ");
}

// ─── placePick callable ───────────────────────────────────────────────────────
// Soccer uses the same placePick Cloud Function as NBA/MLB
const placePickFn = httpsCallable(functions, "placePick");

// ─── Component ────────────────────────────────────────────────────────────────
export default function SoccerWeeklyPage() {
  const { user } = useAuth();
  const sport   = "SOCCER";
  const weekId  = useMemo(() => getWeekId(new Date()), []);
  const dayId   = useMemo(() => getDayId(), []);
  const weekLabel = useMemo(() => getWeekRangeLabel(new Date(), "en-US"), []);

  const [games, setGames]         = useState<any[]>([]);
  const [myPicks, setMyPicks]     = useState<any[]>([]);
  const [err, setErr]             = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const noticeTimer               = useRef<number | null>(null);
  const [q, setQ]                 = useState("");
  const [statusFilter, setStatus] = useState<StatusTab>("all");
  const [market, setMarket]       = useState<MarketTab>("all");
  const [savingKey, setSaving]    = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, LocalPick>>({});

  // ── Registration ──
  const [regStatus, setRegStatus]   = useState<"unknown"|"registered"|"unregistered"|"closed">("unknown");
  const [regLoading, setRegLoading] = useState(false);
  const [firstGameAt, setFirstGameAt] = useState<Date | null>(null);

  const joinWeeklyFn = useMemo(() => httpsCallable(functions, "joinWeeklyTournament"), []);
  const statusFn     = useMemo(() => httpsCallable(functions, "getTournamentStatus"), []);

  function pushNotice(msg: string) {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }

  // ── Listen games (direct Firestore) ──
  useEffect(() => {
    if (!weekId) return;
    const q2 = query(collection(db, "games"), where("sport", "==", "SOCCER"), where("weekId", "==", weekId));
    return onSnapshot(q2, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a: any, b: any) => (a.startTime?.toDate?.()?.getTime?.() ?? 0) - (b.startTime?.toDate?.()?.getTime?.() ?? 0));
      setGames(rows);
    }, (e) => setErr(String((e as any)?.message ?? e)));
  }, [weekId]);

  // ── Listen my picks (direct Firestore) ──
  useEffect(() => {
    if (!user?.uid || !weekId) { setMyPicks([]); return; }
    const q2 = query(
      collection(db, "picks"),
      where("uid", "==", user.uid),
      where("sport", "==", "SOCCER"),
      where("weekId", "==", weekId),
    );
    return onSnapshot(q2, (snap) => {
      setMyPicks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setMyPicks([]));
  }, [user?.uid, weekId]);

  // ── Registration check ──
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    statusFn({ sport, dayId, weekId, type: "weekly" }).then((res: any) => {
      if (cancelled) return;
      const d = res?.data ?? {};
      setRegStatus(d.isRegistered ? "registered" : !d.isOpen ? "closed" : "unregistered");
      if (d.firstGameAt) setFirstGameAt(new Date(d.firstGameAt));
    }).catch(() => { if (!cancelled) setRegStatus("unregistered"); });
    return () => { cancelled = true; };
  }, [user?.uid, weekId]);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // ── Join ──
  async function handleJoin() {
    if (!user?.uid) return;
    setRegLoading(true);
    try {
      await joinWeeklyFn({ sport, weekId });
      setRegStatus("registered");
      pushNotice("✓ Joined Soccer Weekly Tournament!");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setRegStatus(msg.includes("closed") || msg.includes("started") || msg.includes("No games") ? "closed" : "unregistered");
      pushNotice(msg.includes("closed") ? "Tournament is closed." : `Error: ${msg}`);
    } finally { setRegLoading(false); }
  }

  // ── Pick map (server picks + optimistic) ──
  const pickMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of myPicks) m.set(`${p.gameId}:${p.market}`, p);
    // overlay optimistic
    for (const [k, v] of Object.entries(optimistic)) m.set(k, v);
    return m;
  }, [myPicks, optimistic]);

  // ── Filtered + grouped by league ──
  const filtered = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    return games.filter((g: any) => {
      if (!stableGameKey(g)) return false;
     // DESPUÉS:
if (g.status === "final") return false;
if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (!qLow) return true;
      return `${g.awayTeam ?? ""} ${g.homeTeam ?? ""}`.toLowerCase().includes(qLow);
    });
  }, [games, q, statusFilter]);

  const byLeague = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const g of filtered) {
      const lg = (g as any).league ?? "Soccer";
      if (!m.has(lg)) m.set(lg, []);
      m.get(lg)!.push(g);
    }
    return m;
  }, [filtered]);

  // ── Handle pick (toggle + conflict check) ──
  async function handlePick(g: any, mkt: Exclude<MarketTab,"all">, side: SoccerSide, line?: number | null) {
    if (!user?.uid || regStatus !== "registered") return;
    const gameKey = stableGameKey(g);
    if (!gameKey) { pushNotice("Game has no stable ID yet."); return; }
    if (isClosed(g)) { pushNotice("Picks are locked — game already started."); return; }

    const mapKey = `${gameKey}:${mkt}`;
    const current = pickMap.get(mapKey);

    // ── Toggle: clicking same pick clears it ──
    const isSamePick = current?.pick === side;

    // ── Conflict: ML and Spread can't coexist on same game ──
    if (!isSamePick) {
      if (mkt === "moneyline" && pickMap.has(`${gameKey}:spread`)) {
        pushNotice("Can't combine Moneyline and Spread on the same game. Clear Spread first.");
        return;
      }
      if (mkt === "spread" && pickMap.has(`${gameKey}:moneyline`)) {
        pushNotice("Can't combine Spread and Moneyline on the same game. Clear Moneyline first.");
        return;
      }
    }

    setSaving(mapKey);
    setErr(null);

    // Optimistic update
    if (isSamePick) {
      setOptimistic((prev) => { const n = { ...prev }; delete n[mapKey]; return n; });
    } else {
      setOptimistic((prev) => ({ ...prev, [mapKey]: { market: mkt, pick: side, line } }));
    }

    try {
      await placePickFn({
        sport,
        weekId,
        gameId: gameKey,
        market: mkt,
        selection: isSamePick ? side : side, // always send selection
        pick: side,
        line: line ?? null,
        clear: isSamePick,
      });
    } catch (e: any) {
      // revert optimistic
      setOptimistic((prev) => { const n = { ...prev }; delete n[mapKey]; return n; });
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(null);
    }
  }

  const canPick = regStatus === "registered";

  return (
    <Protected>
      <div className="px-6 py-6">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">⚽ Soccer Weekly</h1>
                <span className={badgeBase()}>{weekId}</span>
                <span className={badgeBase()}>{weekLabel}</span>
                <span className={badgeBase()}>Picks: <span className="text-white/80">{myPicks.length}</span></span>
              </div>
              <p className="text-sm text-white/50">
                EPL · La Liga · Bundesliga · Serie A · Ligue 1 · Champions League — all leagues in one tournament. Picks lock at kick-off.
              </p>
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams…"
              className="w-full md:w-64 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20" />
          </div>

          {/* Registration banners */}
          {regStatus === "unregistered" && (
            <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white mb-1">Join Soccer Weekly Tournament</div>
                <div className="text-xs text-white/50">
                  Register before the first kick-off to make picks.
                  {firstGameAt && <span className="text-emerald-300 ml-1">Closes: {firstGameAt.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                </div>
              </div>
              <button onClick={handleJoin} disabled={regLoading}
                className="flex-shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition">
                {regLoading ? <span className="flex items-center gap-2"><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Joining…</span> : "Join Tournament →"}
              </button>
            </div>
          )}
          {regStatus === "closed" && (
            <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/8 px-5 py-4 flex items-start gap-3">
              <span className="text-red-400 flex-shrink-0">🔒</span>
              <div>
                <div className="text-sm font-semibold text-white">Registration closed</div>
                <div className="text-xs text-white/45 mt-0.5">Games have already started. Join next week's tournament.</div>
              </div>
            </div>
          )}
          {regStatus === "registered" && (
            <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-300">
              <span>✓</span><span>You're registered — your picks count toward the leaderboard.</span>
            </div>
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            {(["all","moneyline","spread","ou"] as MarketTab[]).map((m) => (
              <button key={m} onClick={() => setMarket(m)}
                className={["rounded-xl border px-3 py-1.5 text-xs transition", market === m ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-black/20 text-white/50 hover:bg-white/5"].join(" ")}>
                {m === "all" ? "All markets" : m === "moneyline" ? "Moneyline" : m === "spread" ? "Spread" : "O/U"}
              </button>
            ))}
            <div className="ml-auto flex rounded-xl border border-white/10 bg-black/20 p-0.5">
             {(["all","scheduled","inprogress"] as StatusTab[]).map((k) => (
                <button key={k} onClick={() => setStatus(k)}
                  className={["rounded-lg px-3 py-1.5 text-xs transition", statusFilter === k ? "bg-white/10 text-white" : "text-white/40 hover:text-white"].join(" ")}>
                  {k === "all" ? "All" : k === "scheduled" ? "Scheduled" : k === "inprogress" ? "Live" : "Final"}
                </button>
              ))}
            </div>
          </div>

          {/* Notices */}
          {notice && <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}
          {err    && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>}

          {/* Games */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-16 text-center text-white/40">
              No games found for this week.
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(byLeague.entries()).map(([league, leagueGames]) => (
                <div key={league}>
                  <div className="flex items-center gap-3 mb-3">
                    <LeagueBadge league={league} />
                    <span className="text-xs text-white/30">{leagueGames.length} game{leagueGames.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-3">
                    {leagueGames.map((g: any) => {
                      const gameKey = stableGameKey(g);
                      if (!gameKey) return null;

                      const closed   = isClosed(g);
                      const mlPick   = pickMap.get(`${gameKey}:moneyline`);
                      const spPick   = pickMap.get(`${gameKey}:spread`);
                      const ouPick   = pickMap.get(`${gameKey}:ou`);
                      const { homeLine, awayLine } = getSpread(g);
                      const { line: totalLine }    = getTotal(g);
                      const home = g.homeTeam ?? g.home ?? "Home";
                      const away = g.awayTeam ?? g.away ?? "Away";
                      const hasML = pickMap.has(`${gameKey}:moneyline`);
                      const hasSP = pickMap.has(`${gameKey}:spread`);

                      const showML = market === "all" || market === "moneyline";
                      const showSP = market === "all" || market === "spread";
                      const showOU = market === "all" || market === "ou";

                      const busy = (k: string) => savingKey === `${gameKey}:${k}`;

                      return (
                        <div key={gameKey} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                          {/* Game header */}
                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-base font-semibold text-white">{away} <span className="text-white/30">@</span> {home}</span>
                            <span className={["rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              closed ? g.status === "final" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-amber-400/25 bg-amber-500/10 text-amber-300"
                                     : "border-blue-400/20 bg-blue-500/8 text-blue-300"].join(" ")}>
                              {g.status === "final" ? "Final" : g.status === "inprogress" ? "🔴 Live" : "Scheduled"}
                            </span>
                            {g.startTime && <span className="text-xs text-white/35">{fmtStart(g.startTime)}</span>}
                            {closed && g.status === "final" && (
                              <span className="text-xs font-bold text-white/60">{g.scoreAway ?? "?"} – {g.scoreHome ?? "?"}</span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {/* Moneyline — 3-way, no odds shown */}
                            {showML && (
                              <div className="rounded-xl border border-white/6 bg-black/20 p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2.5">Moneyline</div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {([
                                    { side: "away" as SoccerSide, label: away },
                                    { side: "draw" as SoccerSide, label: "Draw" },
                                    { side: "home" as SoccerSide, label: home },
                                  ]).map(({ side, label }) => (
                                    <button key={side}
                                      disabled={closed || !canPick || busy("moneyline") || (hasSP && mlPick?.pick !== side)}
                                      onClick={() => handlePick(g, "moneyline", side)}
                                      className={pickCell(mlPick?.pick === side, closed || !canPick || (hasSP && mlPick?.pick !== side))}>
                                      <span className="truncate block leading-tight text-xs">{label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Spread */}
                            {showSP && (
                              <div className="rounded-xl border border-white/6 bg-black/20 p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2.5">Spread</div>
                                {homeLine !== null || awayLine !== null ? (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {([
                                      { side: "away" as SoccerSide, label: away, line: awayLine },
                                      { side: "home" as SoccerSide, label: home, line: homeLine },
                                    ]).map(({ side, label, line }) => (
                                      <button key={side}
                                        disabled={closed || !canPick || busy("spread") || (hasML && spPick?.pick !== side)}
                                        onClick={() => handlePick(g, "spread", side, line)}
                                        className={pickCell(spPick?.pick === side, closed || !canPick || (hasML && spPick?.pick !== side))}>
                                        <div className="truncate text-xs leading-tight">{label}</div>
                                        <div className="text-[11px] text-white/50 mt-0.5">{showLine(line)}</div>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-white/30 text-center py-3">No line yet</div>
                                )}
                              </div>
                            )}

                            {/* Over/Under */}
                            {showOU && (
                              <div className="rounded-xl border border-white/6 bg-black/20 p-3">
                                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-2.5">Over / Under</div>
                                {totalLine !== null ? (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {([
                                      { side: "over" as SoccerSide,  label: "Over",  val: `O ${totalLine}` },
                                      { side: "under" as SoccerSide, label: "Under", val: `U ${totalLine}` },
                                    ]).map(({ side, label, val }) => (
                                      <button key={side}
                                        disabled={closed || !canPick || busy("ou")}
                                        onClick={() => handlePick(g, "ou", side, totalLine)}
                                        className={pickCell(ouPick?.pick === side, closed || !canPick)}>
                                        <div className="text-xs text-white/50">{label}</div>
                                        <div className="mt-0.5 text-sm font-semibold">{val}</div>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-white/30 text-center py-3">No line yet</div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Active picks summary */}
                          {(mlPick || spPick || ouPick) && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {[["moneyline", mlPick], ["spread", spPick], ["ou", ouPick]].map(([mk, pk]: any) =>
                                pk ? (
                                  <button key={mk} disabled={busy(mk)} onClick={() => handlePick(g, mk, pk.pick, pk.line)}
                                    className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1 text-[11px] text-emerald-300 hover:bg-red-500/10 hover:border-red-400/20 hover:text-red-300 transition disabled:opacity-40">
                                    ✓ {mk === "ou" ? "O/U" : mk.charAt(0).toUpperCase() + mk.slice(1)}: {pk.pick} — tap to clear
                                  </button>
                                ) : null
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 text-[11px] text-white/20">
            Scoring: Win 100 pts · Draw correct pick 200 pts · Loss 0 · Push 50 (Spread/O-U exact line only).
          </div>
        </div>
      </div>
    </Protected>
  );
}
