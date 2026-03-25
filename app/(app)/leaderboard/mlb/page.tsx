"use client";

import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId } from "@/lib/week";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Market = "ALL" | "ML" | "SPREAD" | "OU";
type Sport = "NBA" | "MLB";

type LeaderRow = {
  id: string;
  uid: string;
  username?: string;
  displayName?: string;
  points: number;
  wins?: number;
  losses?: number;
  pushes?: number;
  picks?: number;
  pointsML?: number;
  winsML?: number;
  lossesML?: number;
  pushesML?: number;
  picksML?: number;
  pointsSpread?: number;
  winsSpread?: number;
  lossesSpread?: number;
  pushesSpread?: number;
  picksSpread?: number;
  pointsOU?: number;
  winsOU?: number;
  lossesOU?: number;
  pushesOU?: number;
  picksOU?: number;
};

const ENTRIES_COLLECTION = "leaderboardsEntries";
const SPORT: Sport = "MLB";

function initials(name?: string) {
  const s = (name ?? "User").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || "U";
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function recordOf(row: LeaderRow | null, market: Market) {
  if (!row) return { w: undefined, l: undefined, p: undefined, picks: undefined };
  if (market === "ML") return { w: row.winsML, l: row.lossesML, p: row.pushesML, picks: row.picksML };
  if (market === "SPREAD") {
    return { w: row.winsSpread, l: row.lossesSpread, p: row.pushesSpread, picks: row.picksSpread };
  }
  if (market === "OU") return { w: row.winsOU, l: row.lossesOU, p: row.pushesOU, picks: row.picksOU };
  return { w: row.wins, l: row.losses, p: row.pushes, picks: row.picks };
}

function pointsOf(row: LeaderRow, market: Market) {
  if (market === "ML") return row.pointsML ?? 0;
  if (market === "SPREAD") return row.pointsSpread ?? 0;
  if (market === "OU") return row.pointsOU ?? 0;
  return row.points ?? 0;
}

function formatRecord(w?: number, l?: number, p?: number) {
  const hasAny = typeof w === "number" || typeof l === "number" || typeof p === "number";
  if (!hasAny) return "—";
  return `${w ?? 0}-${l ?? 0}-${p ?? 0}`;
}

function marketLabel(m: Market) {
  if (m === "ALL") return "All markets";
  if (m === "ML") return "Moneyline";
  if (m === "SPREAD") return "Spread";
  return "O/U";
}

function marketBadge(m: Market) {
  if (m === "ALL") return "ALL";
  if (m === "ML") return "ML";
  if (m === "SPREAD") return "SP";
  return "O/U";
}

function toLeaderRow(d: any, id: string): LeaderRow {
  const username = (d.username ?? d.displayName ?? "").toString().trim();
  return {
    id,
    uid: d.uid ?? id,
    username: username || undefined,
    displayName: (d.displayName ?? d.username ?? "User").toString(),
    points: Number(d.points ?? 0),
    wins: typeof d.wins === "number" ? d.wins : undefined,
    losses: typeof d.losses === "number" ? d.losses : undefined,
    pushes: typeof d.pushes === "number" ? d.pushes : undefined,
    picks: typeof d.picks === "number" ? d.picks : undefined,
    pointsML: typeof d.pointsML === "number" ? d.pointsML : undefined,
    winsML: typeof d.winsML === "number" ? d.winsML : undefined,
    lossesML: typeof d.lossesML === "number" ? d.lossesML : undefined,
    pushesML: typeof d.pushesML === "number" ? d.pushesML : undefined,
    picksML: typeof d.picksML === "number" ? d.picksML : undefined,
    pointsSpread: typeof d.pointsSpread === "number" ? d.pointsSpread : undefined,
    winsSpread: typeof d.winsSpread === "number" ? d.winsSpread : undefined,
    lossesSpread: typeof d.lossesSpread === "number" ? d.lossesSpread : undefined,
    pushesSpread: typeof d.pushesSpread === "number" ? d.pushesSpread : undefined,
    picksSpread: typeof d.picksSpread === "number" ? d.picksSpread : undefined,
    pointsOU: typeof d.pointsOU === "number" ? d.pointsOU : undefined,
    winsOU: typeof d.winsOU === "number" ? d.winsOU : undefined,
    lossesOU: typeof d.lossesOU === "number" ? d.lossesOU : undefined,
    pushesOU: typeof d.pushesOU === "number" ? d.pushesOU : undefined,
    picksOU: typeof d.picksOU === "number" ? d.picksOU : undefined,
  };
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [market, setMarket] = useState<Market>("ALL");
  const [qText, setQText] = useState("");
  const [rowsRaw, setRowsRaw] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const weekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekId = useMemo(() => getWeekId(weekDate), [weekDate]);
  const getDisplayName = (r: LeaderRow) => (r.displayName || r.username || "User").trim() || "User";

  const accent = {
    chip: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    btnOn: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    meRow: "bg-emerald-500/10",
  };

  useEffect(() => {
    if (!user?.uid) {
      setLoading(true);
      setErr(null);
      setRowsRaw([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const orderField =
      market === "ML" ? "pointsML" : market === "SPREAD" ? "pointsSpread" : market === "OU" ? "pointsOU" : "points";

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const qSport = query(
          collection(db, ENTRIES_COLLECTION),
          where("weekId", "==", weekId),
          where("sport", "==", SPORT),
          orderBy(orderField, "desc"),
          limit(200),
        );

        const qLeague = query(
          collection(db, ENTRIES_COLLECTION),
          where("weekId", "==", weekId),
          where("league", "==", SPORT),
          orderBy(orderField, "desc"),
          limit(200),
        );

        const [snapA, snapB] = await Promise.all([getDocs(qSport), getDocs(qLeague)]);
        if (cancelled) return;

        const map = new Map<string, LeaderRow>();
        for (const r of snapA.docs.map((d) => toLeaderRow(d.data(), d.id))) map.set(r.uid, r);
        for (const r of snapB.docs.map((d) => toLeaderRow(d.data(), d.id))) map.set(r.uid, r);

        const list = Array.from(map.values()).sort(
          (a, b) => pointsOf(b, market) - pointsOf(a, market) || a.uid.localeCompare(b.uid),
        );
        setRowsRaw(list);
      } catch (e: any) {
        setErr(e?.message ?? "Missing or insufficient permissions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user?.uid, weekId, market]);

  const rows = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rowsRaw;
    return rowsRaw.filter((r) => getDisplayName(r).toLowerCase().includes(t));
  }, [rowsRaw, qText]);

  const myIndex = user?.uid ? rows.findIndex((r) => r.uid === user.uid) : -1;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const myRow = myIndex >= 0 ? rows[myIndex] : null;
  const myPoints = myRow ? pointsOf(myRow, market) : null;
  const myRec = recordOf(myRow, market);

  return (
    <Protected>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">Week {weekId}</span>
              <span className={["inline-flex items-center rounded-full border px-3 py-1 text-xs", accent.chip].join(" ")}>{SPORT}</span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{marketLabel(market)}</span>
            </div>
            <div className="mt-2 text-white/60">Rankings update automatically as games go <span className="text-white/80">FINAL</span>.</div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset((v) => v - 1)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5">← Prev</button>
              <button onClick={() => setWeekOffset(0)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5">Current</button>
              <button onClick={() => setWeekOffset((v) => v + 1)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-white/5">Next →</button>
            </div>
            <input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Search player…"
              className="w-full sm:w-64 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/leaderboard/nba" className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5">NBA</Link>
          <Link href="/leaderboard/mlb" className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">MLB</Link>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(["ALL", "ML", "SPREAD", "OU"] as Market[]).map((m) => {
            const on = m === market;
            const disabled = SPORT === "MLB" && (m === "SPREAD" || m === "OU");
            return (
              <button
                key={m}
                onClick={() => !disabled && setMarket(m)}
                disabled={disabled}
                className={[
                  "rounded-xl border px-4 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed",
                  on ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-black/20 text-white/80 hover:bg-white/5",
                ].join(" ")}
              >
                {marketBadge(m)}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_0_0_1px_rgba(255,255,255,.06),0_0_40px_rgba(99,102,241,.10)]"><div className="text-xs text-white/60">Players</div><div className="mt-1 text-2xl font-semibold">{rows.length}</div><div className="mt-1 text-xs text-white/50">Active this week</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-xs text-white/60">Your rank</div><div className="mt-1 text-2xl font-semibold">{myRank ? <span className="inline-flex items-center gap-2"><span>{medal(myRank)}</span><span className="text-white/70">/ {rows.length}</span></span> : <span className="text-white/50">—</span>}</div><div className="mt-1 text-xs text-white/50">{myRank ? "Keep climbing" : "Not ranked yet"}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-xs text-white/60">Your points</div><div className="mt-1 text-2xl font-semibold">{myRow ? <span>{myPoints} <span className="text-white/60">pts</span></span> : <span className="text-white/50">—</span>}</div><div className="mt-1 text-xs text-white/50">{marketLabel(market)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-xs text-white/60">Your record</div><div className="mt-1 text-2xl font-semibold">{myRow ? formatRecord(myRec.w, myRec.l, myRec.p) : <span className="text-white/50">—</span>}</div><div className="mt-1 text-xs text-white/50">{myRow ? `Picks: ${myRec.picks ?? myRow.picks ?? 0}` : "—"}</div></div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
          {!user?.uid ? (
            <div className="text-white/70">Cargando sesión…</div>
          ) : loading ? (
            <div className="space-y-3"><div className="h-5 w-56 animate-pulse rounded bg-white/10" /><div className="h-14 animate-pulse rounded-xl bg-white/5" /><div className="h-14 animate-pulse rounded-xl bg-white/5" /></div>
          ) : err ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">Error: {err}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">No rankings yet</div>
              <div className="mt-1 text-white/60">Points appear after resolved picks exist for this week.</div>
              <div className="mt-4 flex gap-2">
                <Link href={SPORT === "NBA" ? "/tournaments/nba" : "/tournaments/mlb"} className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">Make picks</Link>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[56px_1fr_120px_140px] gap-3 border-b border-white/10 bg-black/30 px-4 py-3 text-xs text-white/60"><div>Rank</div><div>Player</div><div className="text-right">Points</div><div className="text-right">Record</div></div>
              <div className="divide-y divide-white/10">
                {rows.map((r, idx) => {
                  const isMe = user?.uid && r.uid === user.uid;
                  const rec = recordOf(r, market);
                  const pts = pointsOf(r, market);
                  const name = getDisplayName(r);
                  return (
                    <div key={r.id} className={["grid grid-cols-[56px_1fr_120px_140px] gap-3 px-4 py-3 text-sm", isMe ? accent.meRow : "bg-black/20 hover:bg-white/5"].join(" ")}>
                      <div className="text-white/80">{medal(idx + 1)}</div>
                      <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs text-white/80">{initials(name)}</div><div className="min-w-0"><div className="truncate font-medium">{name}</div><div className="truncate text-xs text-white/45">@{(r.username || name).toLowerCase()}</div></div></div>
                      <div className="text-right font-semibold">{pts} <span className="font-normal text-white/50">pts</span></div>
                      <div className="text-right text-white/70">{formatRecord(rec.w, rec.l, rec.p)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Protected>
  );
}
