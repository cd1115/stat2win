"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/protected";

type PaidTournament = {
  id: string;
  title: string;
  sport: string;
  weekId: string;
  entryFee: number;         // cents
  minPlayers: number;
  maxPlayers: number;
  prizes: number[];         // cents [1st, 2nd, 3rd]
  status: "open" | "locked" | "running" | "finished" | "cancelled";
  participantCount: number;
  deadline?: any;
  startDate?: any;
};

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function fmtDate(ts?: any) {
  if (!ts) return "—";
  try { return ts.toDate().toLocaleDateString("es-PR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return "—"; }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot?: string }> = {
    open:      { label: "Abierto",   cls: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20", dot: "bg-emerald-400 animate-pulse" },
    locked:    { label: "Iniciando", cls: "text-blue-300 bg-blue-500/10 border-blue-400/20",         dot: "bg-blue-400" },
    running:   { label: "En Curso",  cls: "text-amber-300 bg-amber-400/10 border-amber-400/20",      dot: "bg-amber-400 animate-pulse" },
    finished:  { label: "Finalizado",cls: "text-white/40 bg-white/5 border-white/10" },
    cancelled: { label: "Cancelado", cls: "text-red-300/70 bg-red-500/8 border-red-400/15" },
  };
  const { label, cls, dot } = map[status] ?? map.open;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
    </span>
  );
}

function ProgressBar({ current, min, max }: { current: number; min: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  const minPct = (min / max) * 100;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
      <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400/50 transition-all duration-500" style={{ width: `${pct}%` }} />
      {/* Min threshold marker */}
      <div className="absolute top-0 h-full w-px bg-amber-400/60" style={{ left: `${minPct}%` }} />
    </div>
  );
}

export default function PaidTournamentsPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<PaidTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "all">("open");

  useEffect(() => {
    const q = query(
      collection(db, "paid_tournaments")
    );
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PaidTournament);
      // Más reciente primero: ordenar por weekId descendente
      list.sort((a, b) => (b.weekId ?? "").localeCompare(a.weekId ?? ""));
      setTournaments(list);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  const displayed = tab === "open"
    ? tournaments.filter(t => ["open", "locked", "running"].includes(t.status))
    : tournaments;

  const totalPrizePool = (t: PaidTournament) => t.prizes.reduce((s, p) => s + p, 0);

  return (
    <Protected>
      <div className="min-h-screen px-4 py-6">
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">Paid</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">Torneos de Pago</h1>
            <p className="mt-1.5 text-sm text-white/35">Compite con entrada real. Premio en efectivo para el Top 3.</p>
          </div>

          {/* How it works */}
          <div className="mb-5 rounded-2xl border border-amber-400/12 bg-amber-400/4 px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/50 mb-3">¿Cómo funciona?</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: "🎟️", label: "Paga la entrada", sub: "Stripe Checkout seguro" },
                { icon: "🏀", label: "Haz tus picks", sub: "Como en cualquier torneo" },
                { icon: "💵", label: "Gana en efectivo", sub: "Top 3 reciben el premio" },
              ].map(({ icon, label, sub }) => (
                <div key={label}>
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-xs font-bold text-white/70">{label}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-white/25 border-t border-white/6 pt-2.5">
              Si el torneo no alcanza el mínimo de participantes, tu entrada se reembolsa automáticamente a tu tarjeta.
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-4">
            {(["open", "all"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                  tab === t
                    ? "border-white/20 bg-white/8 text-white"
                    : "border-white/8 bg-transparent text-white/35 hover:text-white/60"
                }`}>
                {t === "open" ? "Activos" : "Todos"}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-white/25">{displayed.length} torneos</span>
          </div>

          {/* Tournament cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/4" />)}
            </div>
          ) : displayed.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-10 text-center">
              <div className="text-3xl mb-3">🏆</div>
              <div className="text-sm font-semibold text-white/40">No hay torneos activos ahora mismo</div>
              <div className="text-xs text-white/25 mt-1">Vuelve pronto — se anunciarán nuevos torneos</div>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map(t => (
                <Link key={t.id} href={`/tournaments/paid/detail?id=${t.id}`}
                  className="group relative block rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden hover:border-white/15 hover:bg-[#111318] transition-all duration-200">

                  {/* Top accent */}
                  <div className="h-[2px] w-full bg-gradient-to-r from-amber-400/0 via-amber-400/50 to-amber-400/0" />

                  <div className="px-5 py-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <StatusBadge status={t.status} />
                          <span className="rounded-md border border-white/8 bg-white/4 px-2 py-px text-[10px] font-black text-white/40 uppercase">
                            {t.sport}
                          </span>
                          <span className="text-[10px] text-white/25">{t.weekId}</span>
                        </div>
                        <h2 className="text-base font-black text-white mt-1">{t.title}</h2>
                        <p className="text-xs text-white/35 mt-0.5">Cierra registro: {fmtDate(t.deadline)}</p>
                      </div>

                      {/* Entry fee */}
                      <div className="shrink-0 text-right">
                        <div className="text-2xl font-black text-amber-300">{fmtUsd(t.entryFee)}</div>
                        <div className="text-[10px] text-white/30">entrada</div>
                      </div>
                    </div>

                    {/* Prize pool */}
                    <div className="flex items-center gap-2 mb-4">
                      {t.prizes.slice(0, 3).map((prize, i) => (
                        <div key={i} className={`flex-1 rounded-xl border py-2 text-center ${
                          i === 0 ? "border-amber-400/25 bg-amber-400/8" :
                          i === 1 ? "border-slate-400/15 bg-slate-400/5" :
                                    "border-orange-400/15 bg-orange-400/5"
                        }`}>
                          <div className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                          <div className={`text-sm font-black ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : "text-orange-300"}`}>
                            {fmtUsd(prize)}
                          </div>
                        </div>
                      ))}
                      <div className="flex-1 rounded-xl border border-white/6 bg-white/[0.02] py-2 text-center">
                        <div className="text-base">💰</div>
                        <div className="text-xs font-bold text-white/40">{fmtUsd(totalPrizePool(t))}</div>
                        <div className="text-[9px] text-white/20">total</div>
                      </div>
                    </div>

                    {/* Participants progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/40">
                          <span className="font-bold text-white/70">{t.participantCount}</span> participantes
                        </span>
                        <span className="text-white/25">mínimo {t.minPlayers} · máx {t.maxPlayers}</span>
                      </div>
                      <ProgressBar current={t.participantCount} min={t.minPlayers} max={t.maxPlayers} />
                      <div className="flex items-center justify-between text-[10px] text-white/20">
                        <span>{t.participantCount < t.minPlayers ? `Faltan ${t.minPlayers - t.participantCount} para confirmar` : "✓ Mínimo alcanzado"}</span>
                        <span className="text-amber-400/50">▲ mín</span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white/30 text-lg">→</div>
                </Link>
              ))}
            </div>
          )}

          <p className="mt-8 text-center text-[11px] text-white/15">
            Los pagos se procesan de forma segura con Stripe. Si el torneo no alcanza el mínimo de jugadores, se reembolsa el 100% automáticamente.
          </p>

        </div>
      </div>
    </Protected>
  );
}
