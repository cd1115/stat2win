"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, collection, query, where, orderBy,
  limit, onSnapshot, doc, Timestamp,
} from "firebase/firestore";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type RedeemDoc = {
  id: string; uid: string; productId: string; title?: string;
  pointsCost: number; status: string; createdAt?: Timestamp; updatedAt?: Timestamp;
};

type RewardDoc = {
  id: string; userId: string; type?: string; amount?: number;
  description?: string; createdAt?: Timestamp;
  weekId?: string; sport?: string; wins?: number; pushes?: number;
};

type Tab      = "rewards" | "redeems";
type RFilter  = "all" | "daily_login" | "leaderboard_reward" | "streak_bonus";

const PAGE_SIZE = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts?: Timestamp) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("es-PR", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

function fmtDate(ts?: Timestamp) {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleDateString("es-PR", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function rewardIcon(type?: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "daily_login")       return "🎁";
  if (t === "leaderboard_reward") return "🏆";
  if (t === "streak_bonus")      return "🔥";
  if (t === "pick_reward")       return "✅";
  return "✨";
}

function rewardLabel(type?: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "daily_login")       return "Daily Login";
  if (t === "leaderboard_reward") return "Premio Torneo";
  if (t === "streak_bonus")      return "Bono Racha";
  if (t === "pick_reward")       return "Pick Reward";
  return "Reward";
}

function rewardAccent(type?: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "daily_login")       return "text-sky-300 bg-sky-500/10 border-sky-400/20";
  if (t === "leaderboard_reward") return "text-amber-300 bg-amber-400/10 border-amber-400/20";
  if (t === "streak_bonus")      return "text-orange-300 bg-orange-400/10 border-orange-400/20";
  return "text-white/50 bg-white/5 border-white/10";
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    pending:   { label: "Pendiente", cls: "text-amber-300 bg-amber-400/10 border-amber-400/20",   dot: "bg-amber-400 animate-pulse" },
    created:   { label: "Pendiente", cls: "text-amber-300 bg-amber-400/10 border-amber-400/20",   dot: "bg-amber-400 animate-pulse" },
    shipped:   { label: "En camino", cls: "text-sky-300 bg-sky-400/10 border-sky-400/20",         dot: "bg-sky-400" },
    delivered: { label: "Entregado", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
    fulfilled: { label: "Completado",cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
    cancelled: { label: "Cancelado", cls: "text-red-300 bg-red-400/10 border-red-400/20",         dot: "bg-red-400" },
  };
  const { label, cls, dot } = map[s] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RedeemsPage() {
  const [uid,           setUid]           = useState<string | null>(null);
  const [loadingAuth,   setLoadingAuth]   = useState(true);
  const [userRp,        setUserRp]        = useState<number>(0);

  const [redeems,       setRedeems]       = useState<RedeemDoc[]>([]);
  const [loadingRed,    setLoadingRed]    = useState(true);

  const [rewards,       setRewards]       = useState<RewardDoc[]>([]);
  const [loadingRew,    setLoadingRew]    = useState(true);

  const [tab,           setTab]           = useState<Tab>("rewards");
  const [filter,        setFilter]        = useState<RFilter>("all");
  const [page,          setPage]          = useState(0);

  // Auth
  useEffect(() => {
    const auth = getAuth(getApp());
    return onAuthStateChanged(auth, u => { setUid(u?.uid ?? null); setLoadingAuth(false); });
  }, []);

  // User RP
  useEffect(() => {
    if (!uid) return;
    const db = getFirestore(getApp());
    return onSnapshot(doc(db, "users", uid), snap => {
      setUserRp(Number(snap.data()?.rewardPoints ?? 0));
    });
  }, [uid]);

  // Redeems
  useEffect(() => {
    if (loadingAuth || !uid) { setLoadingRed(false); return; }
    const db = getFirestore(getApp());
    setLoadingRed(true);
    return onSnapshot(
      query(collection(db, "redeems"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(50)),
      snap => { setRedeems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as RedeemDoc)); setLoadingRed(false); },
      () => setLoadingRed(false),
    );
  }, [uid, loadingAuth]);

  // Reward history
  useEffect(() => {
    if (loadingAuth || !uid) { setLoadingRew(false); return; }
    const db = getFirestore(getApp());
    setLoadingRew(true);
    return onSnapshot(
      query(collection(db, "rewardHistory"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(200)),
      snap => { setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() }) as RewardDoc)); setLoadingRew(false); },
      () => setLoadingRew(false),
    );
  }, [uid, loadingAuth]);

  // Derived stats
  const earned     = useMemo(() => rewards.filter(r => Number(r.amount ?? 0) > 0), [rewards]);
  const totalEarn  = useMemo(() => earned.reduce((s, r) => s + Number(r.amount ?? 0), 0), [earned]);
  const totalSpent = useMemo(() => redeems.reduce((s, r) => s + Number(r.pointsCost ?? 0), 0), [redeems]);
  const dailyCount = useMemo(() => earned.filter(r => r.type === "daily_login").length, [earned]);
  const torneoCount= useMemo(() => earned.filter(r => r.type === "leaderboard_reward").length, [earned]);
  const rachaCount = useMemo(() => earned.filter(r => r.type === "streak_bonus").length, [earned]);

  const filtered = useMemo(() => {
    if (filter === "all") return earned;
    return earned.filter(r => r.type === filter);
  }, [earned, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  useEffect(() => setPage(0), [filter, tab]);

  const FILTERS: { key: RFilter; label: string; count: number; color: string }[] = [
    { key: "all",               label: "Todos",    count: earned.length,  color: "border-white/12 text-white/55" },
    { key: "daily_login",       label: "🎁 Daily", count: dailyCount,     color: "border-sky-400/20 text-sky-300" },
    { key: "leaderboard_reward",label: "🏆 Torneo",count: torneoCount,    color: "border-amber-400/20 text-amber-300" },
    { key: "streak_bonus",      label: "🔥 Racha", count: rachaCount,     color: "border-orange-400/20 text-orange-300" },
  ];

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">My Redeems</h1>
            <p className="text-xs text-white/30 mt-0.5">Historial de RP ganados y canjes</p>
          </div>
          <Link href="/store"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/60 hover:bg-white/8 hover:text-white/80 transition">
            Ir al Store →
          </Link>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Balance",      val: `${userRp.toLocaleString()} RP`,    sub: "disponibles",      color: "text-emerald-300", border: "border-emerald-400/15", bg: "bg-emerald-500/5" },
            { label: "Ganados",      val: `${totalEarn.toLocaleString()} RP`, sub: `${earned.length} transacciones`, color: "text-blue-300",    border: "border-blue-400/15",  bg: "bg-blue-500/5" },
            { label: "Canjeados",    val: `${totalSpent.toLocaleString()} RP`,sub: `${redeems.length} items`,        color: "text-amber-300",  border: "border-amber-400/15", bg: "bg-amber-500/5" },
          ].map(({ label, val, sub, color, border, bg }) => (
            <div key={label} className={cn("rounded-2xl border p-3.5", border, bg)}>
              <div className="text-[10px] text-white/35 uppercase font-bold tracking-wider mb-1">{label}</div>
              <div className={cn("text-lg font-black tabular-nums", color)}>{val}</div>
              <div className="text-[10px] text-white/25 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-2 p-1 rounded-xl border border-white/8 bg-white/[0.02]">
          {([
            { key: "rewards",  label: "RP Ganados",  count: earned.length  },
            { key: "redeems",  label: "Mis Canjes",  count: redeems.length },
          ] as { key: Tab; label: string; count: number }[]).map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-bold transition-all duration-200",
                tab === key
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/70"
              )}>
              {label}
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                tab === key ? "bg-white/15 text-white/70" : "bg-white/5 text-white/30")}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Rewards tab ── */}
        {tab === "rewards" && (
          <div className="space-y-3">

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(({ key, label, count, color }) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-bold transition-all",
                    filter === key
                      ? `${color} bg-white/8`
                      : "border-white/8 bg-transparent text-white/35 hover:text-white/60"
                  )}>
                  {label}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              ))}
            </div>

            {loadingRew ? (
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/4" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 text-center">
                <div className="text-3xl mb-2">✨</div>
                <div className="text-sm text-white/40">Sin registros para este filtro</div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden divide-y divide-white/[0.05]">
                  {paged.map(item => {
                    const accent = rewardAccent(item.type);
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                        {/* Icon */}
                        <div className={cn("w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center text-lg", accent)}>
                          {rewardIcon(item.type)}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white/90 truncate">
                            {item.description || rewardLabel(item.type)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={cn("text-[10px] font-bold rounded-full border px-1.5 py-px", accent)}>
                              {rewardLabel(item.type)}
                            </span>
                            {item.sport && <span className="text-[10px] text-white/25">{item.sport}</span>}
                            {item.weekId && <span className="text-[10px] text-white/20">· {item.weekId}</span>}
                            <span className="text-[10px] text-white/20">· {fmtDate(item.createdAt)}</span>
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-sm font-black text-emerald-400 shrink-0 tabular-nums">
                          +{Number(item.amount ?? 0).toLocaleString()}
                          <span className="text-[10px] font-normal text-white/25 ml-0.5">RP</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-white/25">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 hover:bg-white/8 disabled:opacity-25 transition">
                        ←
                      </button>
                      <span className="text-xs text-white/35">{page + 1} / {totalPages}</span>
                      <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 hover:bg-white/8 disabled:opacity-25 transition">
                        →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Redeems tab ── */}
        {tab === "redeems" && (
          <div className="space-y-2">
            {loadingRed ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/4" />)}
              </div>
            ) : redeems.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-10 text-center">
                <div className="text-3xl mb-3">🎁</div>
                <div className="text-sm font-semibold text-white/50">Aún no tienes canjes</div>
                <div className="text-xs text-white/30 mt-1">Acumula RP y canjéalos en el Store</div>
                <Link href="/store"
                  className="mt-4 inline-block rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-xs text-white/60 hover:bg-white/10 transition">
                  Ir al Store →
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden divide-y divide-white/[0.05]">
                {redeems.map(r => (
                  <div key={r.id} className="px-4 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-3">

                      {/* Left: icon + info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-xl border border-amber-400/15 bg-amber-400/8 flex items-center justify-center text-lg">
                          🎁
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white/90 truncate">
                            {r.title || r.productId}
                          </div>
                          <div className="text-[11px] text-white/35 mt-0.5">
                            <span className="text-amber-300 font-semibold">{Number(r.pointsCost ?? 0).toLocaleString()} RP</span>
                            <span className="text-white/20 mx-1.5">·</span>
                            {fmtDate(r.createdAt)}
                          </div>
                        </div>
                      </div>

                      {/* Right: status */}
                      <StatusPill status={r.status} />
                    </div>

                    {/* Redeem ID */}
                    <div className="mt-2 flex items-center gap-2 pl-[52px]">
                      <span className="text-[10px] text-white/18 font-mono truncate">ID: {r.id}</span>
                      {(r.updatedAt || r.createdAt) && (
                        <>
                          <span className="text-white/12">·</span>
                          <span className="text-[10px] text-white/18">Actualizado {fmtDate(r.updatedAt ?? r.createdAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-white/15 pb-4">Stat2Win</p>
      </div>
    </div>
  );
}
