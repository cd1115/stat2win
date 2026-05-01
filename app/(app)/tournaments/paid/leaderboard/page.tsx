"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/protected";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LeaderRow = {
  rank: number;
  uid: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  points: number;
  wins: number;
  losses: number;
  pushes: number;
  picks: number;
};

type LeaderboardData = {
  tournamentId: string;
  tournamentTitle: string;
  prizes: number[];
  status: string;
  weekId: string;
  rows: LeaderRow[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function calcWR(w = 0, l = 0, p = 0) {
  const t = w + l + p;
  return t > 0 ? Math.round((w / t) * 100) : 0;
}

function initials(name?: string | null) {
  const s = (name ?? "?").trim();
  return s.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({
  row, size, isMe, rank,
}: {
  row: LeaderRow; size: number; isMe: boolean; rank?: number;
}) {
  const [imgErr, setImgErr] = useState(false);
  const name = (row.displayName || row.username || "?").trim();

  const borderCls = isMe
    ? "border-emerald-400/60"
    : rank === 1 ? "border-amber-400/70"
    : rank === 2 ? "border-slate-400/50"
    : rank === 3 ? "border-orange-400/40"
    : "border-amber-400/15";

  const bgCls = isMe
    ? "bg-emerald-500/15"
    : rank === 1 ? "bg-amber-400/15"
    : rank === 2 ? "bg-slate-400/10"
    : rank === 3 ? "bg-orange-400/10"
    : "bg-amber-400/5";

  const textCls = isMe
    ? "text-emerald-300"
    : rank === 1 ? "text-amber-300"
    : rank === 2 ? "text-slate-300"
    : rank === 3 ? "text-orange-300"
    : "text-amber-400/50";

  if (row.avatarUrl && !imgErr) {
    return (
      <div className={`shrink-0 overflow-hidden rounded-xl border-2 ${borderCls}`}
        style={{ width: size, height: size }}>
        <img src={row.avatarUrl} alt={name} className="w-full h-full object-cover"
          onError={() => setImgErr(true)} />
      </div>
    );
  }

  return (
    <div className={`shrink-0 flex items-center justify-center rounded-xl border-2 font-black ${borderCls} ${bgCls} ${textCls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      {initials(name)}
    </div>
  );
}

function Record({ w = 0, l = 0, p = 0 }: { w?: number; l?: number; p?: number }) {
  return (
    <span className="text-[9px] tabular-nums">
      <span className="text-emerald-400">{w}W</span>
      <span className="text-white/20"> · </span>
      <span className="text-red-400">{l}L</span>
      {p > 0 && <><span className="text-white/20"> · </span><span className="text-yellow-400">{p}P</span></>}
    </span>
  );
}

// Prize badge shown next to top-3 rows
function PrizeBadge({ prize }: { prize: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black text-amber-300">
      💵 {fmtUsd(prize)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inner component (uses useSearchParams)
// ---------------------------------------------------------------------------
function PaidLeaderboardContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get("id") ?? "";

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const fn = useMemo(() => httpsCallable(getFunctions(getApp()), "getPaidTournamentLeaderboard"), []);

  async function load() {
    if (!tournamentId || !user?.uid) return;
    setLoading(true);
    setErr(null);
    try {
      const res: any = await fn({ tournamentId });
      setData(res.data as LeaderboardData);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo cargar el leaderboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, user?.uid]);

  const rows = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return !t ? data.rows : data.rows.filter(r =>
      (r.displayName || r.username || "").toLowerCase().includes(t));
  }, [data, q]);

  const myIndex = user?.uid ? rows.findIndex(r => r.uid === user.uid) : -1;
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const myRow   = myIndex >= 0 ? rows[myIndex] : null;

  if (!tournamentId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/40 text-sm">
        ID de torneo no especificado. Agrega <code className="ml-1">?id=...</code>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-4">

      {/* ── Gold accent bar ── */}
      <div className="h-[3px] w-full rounded-full bg-gradient-to-r from-amber-400/0 via-amber-400 to-amber-400/0 mb-4" />

      {/* ── Header ── */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/tournaments/paid/detail?id=${tournamentId}`}
              className="text-xs text-amber-400/50 hover:text-amber-300 transition">
              ← Torneo
            </Link>
            <span className="text-white/15">·</span>
            <Link href={`/tournaments/paid/mlb?id=${tournamentId}`}
              className="text-xs text-amber-400/50 hover:text-amber-300 transition">
              Picks
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Torneo de Pago
            </span>
          </div>
          <h1 className="text-xl font-black text-white">
            {data?.tournamentTitle ?? "Leaderboard"}
          </h1>
          {data?.weekId && (
            <p className="text-xs text-white/30 mt-0.5">Semana {data.weekId}</p>
          )}
        </div>

        {/* Refresh button */}
        <button onClick={load} disabled={loading}
          className="shrink-0 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-1.5 text-xs text-amber-300/70 hover:bg-amber-400/12 transition disabled:opacity-40">
          {loading ? "⟳" : "↺"} Actualizar
        </button>
      </div>

      {/* ── Prize pool banner ── */}
      {data && data.prizes.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/40 mb-3">
            💰 Premios en efectivo
          </div>
          <div className="flex gap-2">
            {data.prizes.slice(0, 3).map((prize, i) => (
              <div key={i} className={`flex-1 rounded-xl border py-2.5 text-center ${
                i === 0 ? "border-amber-400/30 bg-amber-400/10"
                : i === 1 ? "border-slate-400/20 bg-slate-400/6"
                : "border-orange-400/15 bg-orange-400/5"
              }`}>
                <div className="text-lg mb-0.5">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                <div className={`text-base font-black ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : "text-orange-300"}`}>
                  {fmtUsd(prize)}
                </div>
                <div className="text-[9px] text-white/25 mt-0.5">#{i + 1} lugar</div>
              </div>
            ))}
            <div className="flex-1 rounded-xl border border-white/6 bg-white/[0.02] py-2.5 text-center">
              <div className="text-lg mb-0.5">💵</div>
              <div className="text-sm font-black text-white/50">
                {fmtUsd(data.prizes.reduce((s, p) => s + p, 0))}
              </div>
              <div className="text-[9px] text-white/25 mt-0.5">total</div>
            </div>
          </div>
        </div>
      )}

      {/* ── My position banner ── */}
      {myRank !== null && myRow && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/6 px-4 py-3">
          <Avatar row={myRow} size={40} isMe rank={myRank} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-emerald-300 truncate">
              {(myRow.displayName || myRow.username || "Tú").trim()}
            </div>
            <Record w={myRow.wins} l={myRow.losses} p={myRow.pushes} />
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-white/35 mb-0.5">Tu posición</div>
            <div className="text-lg font-black text-emerald-300">#{myRank}</div>
            <div className="text-[10px] text-emerald-400/60">de {rows.length}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-black text-white">{calcWR(myRow.wins, myRow.losses, myRow.pushes)}%</div>
            <div className="text-[10px] text-white/30">{myRow.points.toLocaleString()} pts</div>
          </div>
        </div>
      )}

      {/* ── Podium top 3 ── */}
      {!loading && rows.length >= 1 && data && (
        <div className="mb-3 rounded-2xl border border-amber-400/12 bg-amber-400/[0.02] overflow-hidden">
          {/* Gold header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/40">Top 3 del torneo</span>
            <span className="text-[10px] text-white/20">{data.weekId}</span>
          </div>

          <div className="flex items-end justify-center gap-4 px-4 pb-0 pt-1">

            {/* #2 Silver */}
            {rows[1] && (() => {
              const r = rows[1];
              const wr = calcWR(r.wins, r.losses, r.pushes);
              const name = (r.displayName || r.username || "User").trim();
              const prize = data.prizes[1];
              return (
                <div className="flex flex-col items-center gap-1 flex-1">
                  <Avatar row={r} size={44} isMe={user?.uid === r.uid} rank={2} />
                  <div className="text-center mt-1">
                    <div className="text-xs font-bold text-white/75 truncate max-w-[70px]">{name.split(" ")[0]}</div>
                    <div className="text-[11px] font-black text-slate-300">{wr}%</div>
                    <Record w={r.wins} l={r.losses} p={r.pushes} />
                    <div className="text-[9px] text-white/30 mt-0.5">{r.points.toLocaleString()} pts</div>
                    {prize != null && <div className="text-[9px] text-slate-300/60 mt-0.5">{fmtUsd(prize)}</div>}
                  </div>
                  <div className="w-full h-14 rounded-t-xl bg-slate-400/10 border border-slate-400/15 border-b-0 flex items-center justify-center">
                    <span className="text-xl">🥈</span>
                  </div>
                </div>
              );
            })()}

            {/* #1 Gold */}
            {rows[0] && (() => {
              const r = rows[0];
              const wr = calcWR(r.wins, r.losses, r.pushes);
              const name = (r.displayName || r.username || "User").trim();
              const prize = data.prizes[0];
              return (
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className="text-base mb-0.5">👑</div>
                  <Avatar row={r} size={54} isMe={user?.uid === r.uid} rank={1} />
                  <div className="text-center mt-1">
                    <div className="text-sm font-black text-white truncate max-w-[76px]">{name.split(" ")[0]}</div>
                    <div className="text-[13px] font-black text-amber-300">{wr}%</div>
                    <Record w={r.wins} l={r.losses} p={r.pushes} />
                    <div className="text-[9px] text-amber-300/60 mt-0.5">{r.points.toLocaleString()} pts</div>
                    {prize != null && <div className="text-[9px] text-amber-400/70 font-bold mt-0.5">{fmtUsd(prize)}</div>}
                  </div>
                  <div className="w-full h-20 rounded-t-xl bg-amber-400/12 border border-amber-400/25 border-b-0 flex items-center justify-center">
                    <span className="text-2xl">🥇</span>
                  </div>
                </div>
              );
            })()}

            {/* #3 Bronze */}
            {rows[2] && (() => {
              const r = rows[2];
              const wr = calcWR(r.wins, r.losses, r.pushes);
              const name = (r.displayName || r.username || "User").trim();
              const prize = data.prizes[2];
              return (
                <div className="flex flex-col items-center gap-1 flex-1">
                  <Avatar row={r} size={38} isMe={user?.uid === r.uid} rank={3} />
                  <div className="text-center mt-1">
                    <div className="text-xs font-bold text-white/60 truncate max-w-[62px]">{name.split(" ")[0]}</div>
                    <div className="text-[10px] font-black text-orange-300">{wr}%</div>
                    <Record w={r.wins} l={r.losses} p={r.pushes} />
                    <div className="text-[9px] text-white/25 mt-0.5">{r.points.toLocaleString()} pts</div>
                    {prize != null && <div className="text-[9px] text-orange-300/50 mt-0.5">{fmtUsd(prize)}</div>}
                  </div>
                  <div className="w-full h-9 rounded-t-xl bg-orange-400/8 border border-orange-400/12 border-b-0 flex items-center justify-center">
                    <span className="text-base">🥉</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="h-px bg-amber-400/[0.08] mx-4 mt-1" />
          <div className="text-center text-[9px] text-amber-400/20 uppercase tracking-widest py-1.5">
            Win Rate · W · L · P · Puntos · Premio
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jugador…"
          className="w-full rounded-xl border border-amber-400/15 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-400/35" />
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl border border-amber-400/12 bg-white/[0.02] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[36px_1fr_50px_56px_72px] gap-2 border-b border-amber-400/[0.08] bg-black/20 px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/30">
          <div>#</div>
          <div>Jugador</div>
          <div className="text-center">Win%</div>
          <div className="text-center">Picks</div>
          <div className="text-right">Pts</div>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-amber-400/5" />)}
          </div>
        ) : err ? (
          <div className="m-3 rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-red-300 text-sm">{err}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-3xl mb-3">🏆</div>
            <div className="text-sm text-white/40 mb-2">Sin participantes aún.</div>
            <Link href={`/tournaments/paid/mlb?id=${tournamentId}`}
              className="inline-block rounded-xl border border-amber-400/20 bg-amber-400/8 px-4 py-2 text-xs text-amber-300 hover:bg-amber-400/12 transition">
              Hacer picks →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-amber-400/[0.05]">
            {rows.map((r, idx) => {
              const rank  = idx + 1;
              const isMe  = !!(user?.uid && r.uid === user.uid);
              const wr    = calcWR(r.wins, r.losses, r.pushes);
              const name  = (r.displayName || r.username || "User").trim();
              const prize = data?.prizes[idx];

              const accentColor =
                rank === 1 ? "#F59E0B" :
                rank === 2 ? "#94A3B8" :
                rank === 3 ? "#FB923C" :
                isMe ? "#10B981" : "rgba(251,191,36,0.06)";

              return (
                <div key={r.uid}
                  className={`relative grid grid-cols-[36px_1fr_50px_56px_72px] gap-2 px-3 py-3 items-center transition-colors ${isMe ? "bg-emerald-500/6" : "hover:bg-amber-400/[0.02]"}`}>
                  {/* Left accent bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ background: accentColor }} />

                  {/* Rank */}
                  <div className="pl-2 text-xs font-bold text-white/50">
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : (
                      <span className={isMe ? "text-emerald-400" : "text-white/30"}>{`#${rank}`}</span>
                    )}
                  </div>

                  {/* Player */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar row={r} size={34} isMe={isMe} rank={rank <= 3 ? rank : undefined} />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm font-semibold ${isMe ? "text-emerald-300" : "text-white/80"}`}>{name}</div>
                        <Record w={r.wins} l={r.losses} p={r.pushes} />
                      </div>
                    </div>
                    {/* Prize badge for top 3 */}
                    {prize != null && rank <= 3 && (
                      <div className="pl-[42px]">
                        <PrizeBadge prize={prize} />
                      </div>
                    )}
                  </div>

                  {/* Win% */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-xs font-bold tabular-nums ${isMe ? "text-emerald-300" : "text-white/60"}`}>{wr}%</span>
                    <div className="h-1 w-10 rounded-full bg-white/8 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400/50" style={{ width: `${wr}%` }} />
                    </div>
                  </div>

                  {/* Picks */}
                  <div className="text-center">
                    <span className="text-xs tabular-nums text-white/40">{r.picks}</span>
                  </div>

                  {/* Points */}
                  <div className="text-right">
                    <div className={`text-sm font-black tabular-nums ${isMe ? "text-emerald-300" : rank <= 3 ? "text-amber-300" : "text-white/60"}`}>
                      {r.points.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-white/20">pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-white/20">
        <span>Win 100 · Push 50 · Loss 0 · Actualiza cada 30s</span>
        <span>{rows.length} participante{rows.length !== 1 ? "s" : ""}</span>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export — Suspense boundary for static export
// ---------------------------------------------------------------------------
export default function PaidLeaderboardPage() {
  return (
    <Protected>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
        </div>
      }>
        <PaidLeaderboardContent />
      </Suspense>
    </Protected>
  );
}
