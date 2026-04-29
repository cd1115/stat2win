"use client";

import Protected from "@/components/protected";
import { useAuth } from "@/lib/auth-context";
import { getWeekId, getWeekRangeLabel } from "@/lib/week";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, documentId } from "firebase/firestore";
import { getApp } from "firebase/app";

type Market = "ALL" | "ML" | "SPREAD" | "OU";

type LeaderRow = {
  id: string; uid: string; username?: string; displayName?: string;
  points: number; wins?: number; losses?: number; pushes?: number; picks?: number;
  pointsML?: number; winsML?: number; lossesML?: number; pushesML?: number; picksML?: number;
  pointsSpread?: number; winsSpread?: number; lossesSpread?: number; pushesSpread?: number; picksSpread?: number;
  pointsOU?: number; winsOU?: number; lossesOU?: number; pushesOU?: number; picksOU?: number;
};

type SportCfg = {
  key: string;
  label: string;
  emoji: string;
  activeColor: string;      // text color
  activeBg: string;         // bg class
  activeBorder: string;     // border class
  accentBar: string;        // inline hex for left bar
  tournamentHref: string;
};

const SPORT_CFGS: Record<string, SportCfg> = {
  NBA:    { key:"NBA",    label:"NBA",    emoji:"🏀", activeColor:"text-blue-300",    activeBg:"bg-blue-500/15",   activeBorder:"border-blue-400/30",   accentBar:"#3B82F6", tournamentHref:"/tournaments/nba"    },
  MLB:    { key:"MLB",    label:"MLB",    emoji:"⚾", activeColor:"text-red-300",     activeBg:"bg-red-500/12",    activeBorder:"border-red-400/25",    accentBar:"#EF4444", tournamentHref:"/tournaments/mlb"    },
  SOCCER: { key:"SOCCER", label:"Soccer", emoji:"⚽", activeColor:"text-emerald-300", activeBg:"bg-emerald-500/12",activeBorder:"border-emerald-400/25",accentBar:"#10B981", tournamentHref:"/tournaments/soccer" },
};

const MARKETS: { key: Market; label: string; activeColor: string; activeBg: string; activeBorder: string }[] = [
  { key:"ALL",    label:"ALL",    activeColor:"text-white",        activeBg:"bg-white/10",       activeBorder:"border-white/20"         },
  { key:"ML",     label:"ML",     activeColor:"text-blue-300",     activeBg:"bg-blue-500/15",    activeBorder:"border-blue-400/30"      },
  { key:"SPREAD", label:"Spread", activeColor:"text-violet-300",   activeBg:"bg-violet-500/15",  activeBorder:"border-violet-400/30"    },
  { key:"OU",     label:"O/U",    activeColor:"text-amber-300",    activeBg:"bg-amber-500/12",   activeBorder:"border-amber-400/25"     },
];

function initials(name?: string) {
  const s = (name ?? "?").trim();
  return s.split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()??"").join("") || "?";
}

function recordOf(row: LeaderRow | null, market: Market) {
  if (!row) return { w: undefined, l: undefined, p: undefined };
  if (market === "ML")     return { w: row.winsML,     l: row.lossesML,     p: row.pushesML };
  if (market === "SPREAD") return { w: row.winsSpread, l: row.lossesSpread, p: row.pushesSpread };
  if (market === "OU")     return { w: row.winsOU,     l: row.lossesOU,     p: row.pushesOU };
  return { w: row.wins, l: row.losses, p: row.pushes };
}

function pointsOf(row: LeaderRow, market: Market) {
  if (market === "ML")     return row.pointsML ?? 0;
  if (market === "SPREAD") return row.pointsSpread ?? 0;
  if (market === "OU")     return row.pointsOU ?? 0;
  return row.points ?? 0;
}

function calcWR(w=0, l=0, p=0) {
  const t = w + l + p;
  return t > 0 ? Math.round((w / t) * 100) : 0;
}

// ── Avatar: shows image if available, else initials ───────────────────────────
function Avatar({ uid, name, size, avatarUrls, isMe, rank }: {
  uid: string; name: string; size: number;
  avatarUrls: Record<string,string>; isMe: boolean; rank?: number;
}) {
  const url = avatarUrls[uid];
  const borderCls = isMe
    ? "border-emerald-400/50"
    : rank === 1 ? "border-amber-400/50"
    : rank === 2 ? "border-slate-400/40"
    : rank === 3 ? "border-orange-400/35"
    : "border-white/10";
  const bgCls = isMe
    ? "bg-emerald-500/15"
    : rank === 1 ? "bg-amber-400/12"
    : rank === 2 ? "bg-slate-400/10"
    : rank === 3 ? "bg-orange-400/10"
    : "bg-white/[0.04]";
  const textCls = isMe
    ? "text-emerald-300"
    : rank === 1 ? "text-amber-300"
    : rank === 2 ? "text-slate-300"
    : rank === 3 ? "text-orange-300"
    : "text-white/40";

  if (url) return (
    <div className={`shrink-0 overflow-hidden rounded-xl border-2 ${borderCls}`} style={{ width: size, height: size }}>
      <img src={url} alt={name} className="w-full h-full object-cover" />
    </div>
  );
  return (
    <div className={`shrink-0 flex items-center justify-center rounded-xl border-2 font-black ${borderCls} ${bgCls} ${textCls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      {initials(name)}
    </div>
  );
}

// ── Colored record: 12W · 4L · 1P ────────────────────────────────────────────
function Record({ w=0, l=0, p=0, size="sm" }: { w?:number; l?:number; p?:number; size?:"xs"|"sm" }) {
  const cls = size === "xs" ? "text-[9px]" : "text-[10px] font-semibold";
  return (
    <span className={`${cls} tabular-nums`}>
      <span className="text-emerald-400">{w}W</span>
      <span className="text-white/20"> · </span>
      <span className="text-red-400">{l}L</span>
      {p > 0 && <><span className="text-white/20"> · </span><span className="text-yellow-400">{p}P</span></>}
    </span>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function LeaderboardWeeklyPage({ sport }: { sport: string }) {
  const { user } = useAuth();
  const cfg = SPORT_CFGS[sport] ?? SPORT_CFGS["NBA"];

  const [weekOffset, setWeekOffset] = useState(0);
  const [market, setMarket] = useState<Market>("ALL");
  const [qText, setQText] = useState("");
  const [rowsRaw, setRowsRaw] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string,string>>({});

  const weekDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + weekOffset * 7); return d;
  }, [weekOffset]);
  const weekId    = useMemo(() => getWeekId(weekDate), [weekDate]);
  const weekLabel = useMemo(() => getWeekRangeLabel(weekDate, "es-PR"), [weekDate]);

  // Load leaderboard
  useEffect(() => {
    if (!user?.uid) { setLoading(true); setErr(null); setRowsRaw([]); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function load() {
      setLoading(true); setErr(null);
      try {
        const fn = httpsCallable(getFunctions(getApp(), "us-central1"), "getLeaderboardWeek");
        const res: any = await fn({ weekId, sport, market });
        if (!cancelled) setRowsRaw(Array.isArray(res?.data?.rows) ? res.data.rows : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Could not load leaderboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    timer = setInterval(load, 30000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [user?.uid, weekId, sport, market]);

  // Batch-fetch avatars
  useEffect(() => {
    const uids = rowsRaw.map(r => r.uid).filter(Boolean);
    if (!uids.length) { setAvatarUrls({}); return; }
    async function fetchAvatars() {
      try {
        const chunks: string[][] = [];
        for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i+30));
        const map: Record<string,string> = {};
        for (const chunk of chunks) {
          const q = query(collection(db, "users"), where(documentId(), "in", chunk));
          const snap = await getDocs(q);
          snap.forEach(d => { const url = (d.data() as any)?.avatarUrl; if (url) map[d.id] = url; });
        }
        setAvatarUrls(map);
      } catch {}
    }
    fetchAvatars();
  }, [rowsRaw]);

  const rows = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return !t ? rowsRaw : rowsRaw.filter(r => (r.displayName||r.username||"").toLowerCase().includes(t));
  }, [rowsRaw, qText]);

  const myIndex = user?.uid ? rows.findIndex(r => r.uid === user.uid) : -1;
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const myRow   = myIndex >= 0 ? rows[myIndex] : null;
  const myRec   = recordOf(myRow, market);
  const myPts   = myRow ? pointsOf(myRow, market) : null;
  const myWR    = myRow ? calcWR(myRec.w??0, myRec.l??0, myRec.p??0) : null;

  const OTHER_SPORTS = Object.values(SPORT_CFGS).filter(s => s.key !== sport);

  return (
    <Protected>
      <div className="mx-auto max-w-2xl px-3 py-4">

        {/* ── Week nav ── */}
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-2 py-1.5 mb-3">
          <button onClick={() => setWeekOffset(v => v-1)} className="rounded-xl p-2 text-white/50 hover:bg-white/8 hover:text-white transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">{weekId}</span>
            <span className="text-sm font-semibold text-white">{weekLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="rounded-lg px-2.5 py-1 text-xs text-white/35 hover:bg-white/8 hover:text-white/60 transition">Ahora</button>
            )}
            <button onClick={() => setWeekOffset(v => v+1)} className="rounded-xl p-2 text-white/50 hover:bg-white/8 hover:text-white transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* ── Sport tabs ── */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5">
          {/* Active sport */}
          <div className={`shrink-0 flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold ${cfg.activeColor} ${cfg.activeBg} ${cfg.activeBorder}`}>
            <span className="text-base">{cfg.emoji}</span>{cfg.label}
          </div>
          {/* Other sports */}
          {OTHER_SPORTS.map(s => (
            <Link key={s.key} href={`/leaderboard/${s.key.toLowerCase()}`}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/45 hover:bg-white/8 hover:text-white/80 transition">
              <span className="text-base">{s.emoji}</span>{s.label}
            </Link>
          ))}
          {/* Daily */}
          <Link href="/leaderboard/daily"
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/8 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/12 transition">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Daily
          </Link>
        </div>

        {/* ── Market pills ── */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5">
          {MARKETS.map(m => {
            const active = m.key === market;
            return (
              <button key={m.key} onClick={() => setMarket(m.key)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition ${active ? `${m.activeColor} ${m.activeBg} ${m.activeBorder}` : "border-white/10 bg-white/[0.02] text-white/40 hover:text-white/70 hover:bg-white/6"}`}>
                {m.label}
              </button>
            );
          })}
          {/* Search */}
          <input value={qText} onChange={e => setQText(e.target.value)} placeholder="Buscar…"
            className="ml-auto w-28 shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20" />
        </div>

        {/* ── My position banner ── */}
        {myRank !== null && myRow && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/6 px-4 py-3">
            <Avatar uid={myRow.uid} name={(myRow.displayName||myRow.username||"Tú").trim()} size={40} avatarUrls={avatarUrls} isMe rank={myRank} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-emerald-300 truncate">{(myRow.displayName||myRow.username||"Tú").trim()}</div>
              <Record w={myRec.w??0} l={myRec.l??0} p={myRec.p??0} size="xs" />
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-white/35 mb-0.5">Tu posición</div>
              <div className="text-lg font-black text-emerald-300">#{myRank}</div>
              <div className="text-[10px] text-emerald-400/60">de {rows.length}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-black text-white">{myWR}%</div>
              <div className="text-[10px] text-white/30">{myPts?.toLocaleString()} pts</div>
            </div>
          </div>
        )}

        {/* ── Podium top 3 ── */}
        {!loading && rows.length >= 1 && (
          <div className="mb-3 rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Top 3 esta semana</span>
              <span className="text-[10px] text-white/20">{weekId}</span>
            </div>
            <div className="flex items-end justify-center gap-4 px-4 pb-0 pt-1">
              {/* #2 Silver */}
              {rows[1] && (() => {
                const r = rows[1]; const rec = recordOf(r, market);
                const pts = pointsOf(r, market); const wr = calcWR(rec.w??0,rec.l??0,rec.p??0);
                const name = (r.displayName||r.username||"User").trim();
                return (
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <Avatar uid={r.uid} name={name} size={44} avatarUrls={avatarUrls} isMe={user?.uid===r.uid} rank={2} />
                    <div className="text-center mt-1">
                      <div className="text-xs font-bold text-white/75 truncate max-w-[70px]">{name.split(" ")[0]}</div>
                      <div className="text-[11px] font-black text-slate-300">{wr}%</div>
                      <Record w={rec.w??0} l={rec.l??0} p={rec.p??0} size="xs" />
                      <div className="text-[9px] text-white/30 mt-0.5">{pts.toLocaleString()} pts</div>
                    </div>
                    <div className="w-full h-14 rounded-t-xl bg-slate-400/10 border border-slate-400/15 border-b-0 flex items-center justify-center">
                      <span className="text-xl">🥈</span>
                    </div>
                  </div>
                );
              })()}
              {/* #1 Gold */}
              {rows[0] && (() => {
                const r = rows[0]; const rec = recordOf(r, market);
                const pts = pointsOf(r, market); const wr = calcWR(rec.w??0,rec.l??0,rec.p??0);
                const name = (r.displayName||r.username||"User").trim();
                return (
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="text-base mb-0.5">👑</div>
                    <Avatar uid={r.uid} name={name} size={54} avatarUrls={avatarUrls} isMe={user?.uid===r.uid} rank={1} />
                    <div className="text-center mt-1">
                      <div className="text-sm font-black text-white truncate max-w-[76px]">{name.split(" ")[0]}</div>
                      <div className="text-[13px] font-black text-amber-300">{wr}%</div>
                      <Record w={rec.w??0} l={rec.l??0} p={rec.p??0} size="xs" />
                      <div className="text-[9px] text-amber-300/60 mt-0.5">{pts.toLocaleString()} pts</div>
                    </div>
                    <div className="w-full h-20 rounded-t-xl bg-amber-400/10 border border-amber-400/20 border-b-0 flex items-center justify-center">
                      <span className="text-2xl">🥇</span>
                    </div>
                  </div>
                );
              })()}
              {/* #3 Bronze */}
              {rows[2] && (() => {
                const r = rows[2]; const rec = recordOf(r, market);
                const pts = pointsOf(r, market); const wr = calcWR(rec.w??0,rec.l??0,rec.p??0);
                const name = (r.displayName||r.username||"User").trim();
                return (
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <Avatar uid={r.uid} name={name} size={38} avatarUrls={avatarUrls} isMe={user?.uid===r.uid} rank={3} />
                    <div className="text-center mt-1">
                      <div className="text-xs font-bold text-white/60 truncate max-w-[62px]">{name.split(" ")[0]}</div>
                      <div className="text-[10px] font-black text-orange-300">{wr}%</div>
                      <Record w={rec.w??0} l={rec.l??0} p={rec.p??0} size="xs" />
                      <div className="text-[9px] text-white/25 mt-0.5">{pts.toLocaleString()} pts</div>
                    </div>
                    <div className="w-full h-9 rounded-t-xl bg-orange-400/8 border border-orange-400/12 border-b-0 flex items-center justify-center">
                      <span className="text-base">🥉</span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="h-px bg-white/[0.05] mx-4 mt-1" />
            <div className="text-center text-[9px] text-white/15 uppercase tracking-widest py-1.5">Win Rate · W · L · P · Puntos</div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[36px_1fr_50px_72px] gap-2 border-b border-white/[0.06] bg-black/20 px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
            <div>#</div>
            <div>Jugador</div>
            <div className="text-center">Win%</div>
            <div className="text-right">Pts</div>
          </div>

          {!user?.uid || loading ? (
            <div className="space-y-2 p-3">
              {[1,2,3,4].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}
            </div>
          ) : err ? (
            <div className="m-3 rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-red-300 text-sm">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">🏆</div>
              <div className="text-sm text-white/50 mb-3">Sin rankings aún esta semana.</div>
              <Link href={cfg.tournamentHref} className="rounded-xl border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition">
                Hacer picks →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {rows.map((r, idx) => {
                const rank  = idx + 1;
                const isMe  = !!(user?.uid && r.uid === user.uid);
                const rec   = recordOf(r, market);
                const pts   = pointsOf(r, market);
                const wr    = calcWR(rec.w??0, rec.l??0, rec.p??0);
                const name  = (r.displayName || r.username || "User").trim();
                const maxPts = pointsOf(rows[0], market);
                const barW  = maxPts > 0 ? Math.round((wr / 100) * 100) : 0;

                const accentColor =
                  rank === 1 ? "#F59E0B" :
                  rank === 2 ? "#94A3B8" :
                  rank === 3 ? "#FB923C" :
                  isMe ? "#10B981" : "rgba(255,255,255,0.06)";

                return (
                  <div key={r.id} className={`relative grid grid-cols-[36px_1fr_50px_72px] gap-2 px-3 py-3 items-center transition-colors ${isMe ? "bg-emerald-500/6" : "hover:bg-white/[0.02]"}`}>
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accentColor }} />

                    {/* Rank */}
                    <div className="pl-2 text-xs font-bold text-white/50">
                      {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : <span className={isMe ? "text-emerald-400" : ""}>{`#${rank}`}</span>}
                    </div>

                    {/* Player */}
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar uid={r.uid} name={name} size={34} avatarUrls={avatarUrls} isMe={isMe} rank={rank <= 3 ? rank : undefined} />
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-semibold ${isMe ? "text-emerald-300" : "text-white/80"}`}>{name}</div>
                        <Record w={rec.w??0} l={rec.l??0} p={rec.p??0} size="xs" />
                      </div>
                    </div>

                    {/* Win% */}
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-xs font-bold tabular-nums ${isMe ? "text-emerald-300" : "text-white/60"}`}>{wr}%</span>
                      <div className="h-1 w-10 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${barW}%` }} />
                      </div>
                    </div>

                    {/* Points */}
                    <div className="text-right">
                      <div className={`text-sm font-black tabular-nums ${isMe ? "text-emerald-300" : rank <= 3 ? "text-white" : "text-white/60"}`}>
                        {pts.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-white/25">pts</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-[10px] text-white/20">
          <span>Win 100 · Push 50 · Loss 0 · Actualiza cada 30s</span>
          <span>{rows.length} jugador{rows.length !== 1 ? "es" : ""}</span>
        </div>

      </div>
    </Protected>
  );
}
