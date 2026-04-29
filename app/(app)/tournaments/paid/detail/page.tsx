"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import Protected from "@/components/protected";

type PaidTournament = {
  id: string; title: string; sport: string; weekId: string;
  entryFee: number; minPlayers: number; maxPlayers: number;
  prizes: number[]; status: string; participantCount: number;
  deadline?: any; startDate?: any; endDate?: any;
  finalRanking?: { uid: string; rank: number; points: number }[];
};

type MyEntry = {
  paymentStatus: "pending" | "paid" | "refunded";
  prizeRank?: number; prizeAmountCents?: number; prizeStatus?: string;
};

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function fmtDate(ts?: any) {
  if (!ts) return "—";
  try { return ts.toDate().toLocaleDateString("es-PR", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return "—"; }
}

function countdown(ts?: any): string {
  if (!ts) return "";
  try {
    const diff = ts.toDate().getTime() - Date.now();
    if (diff <= 0) return "Cerrado";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
  } catch { return ""; }
}

export default function PaidTournamentDetailPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useAuth();
  const id           = searchParams?.get("id") ?? "";
  const entryResult  = searchParams?.get("entry");

  const [tournament, setTournament] = useState<PaidTournament | null>(null);
  const [myEntry,    setMyEntry]    = useState<MyEntry | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [joining,    setJoining]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [timeLeft,   setTimeLeft]   = useState("");

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "paid_tournaments", id), snap => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as PaidTournament);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || !user?.uid) return;
    return onSnapshot(doc(db, "paid_tournament_entries", `${id}_${user.uid}`), snap => {
      setMyEntry(snap.exists() ? snap.data() as MyEntry : null);
    });
  }, [id, user?.uid]);

  useEffect(() => {
    if (!tournament?.deadline) return;
    setTimeLeft(countdown(tournament.deadline));
    const iv = setInterval(() => setTimeLeft(countdown(tournament.deadline)), 30000);
    return () => clearInterval(iv);
  }, [tournament?.deadline]);

  async function handleJoin() {
    if (!user?.uid || !tournament) return;
    setJoining(true);
    setError(null);
    try {
      const fn = httpsCallable<any, any>(getFunctions(getApp()), "createPaidTournamentCheckout");
      const origin = window.location.origin;
      const res = await fn({
        tournamentId: id,
        successUrl: `${origin}/tournaments/paid/detail?id=${id}&entry=success`,
        cancelUrl:  `${origin}/tournaments/paid/detail?id=${id}&entry=cancelled`,
      });
      if (res.data?.url) window.location.href = res.data.url;
    } catch (e: any) {
      setError(e?.message ?? "Error al crear la sesión de pago.");
    } finally {
      setJoining(false);
    }
  }

  if (!id) return (
    <Protected>
      <div className="min-h-screen px-4 py-20 text-center">
        <div className="text-white/40 text-sm">ID de torneo no especificado</div>
        <Link href="/tournaments/paid" className="mt-4 inline-block text-xs text-blue-400">← Volver</Link>
      </div>
    </Protected>
  );

  if (loading) return (
    <Protected>
      <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/4" />)}
      </div>
    </Protected>
  );

  if (!tournament) return (
    <Protected>
      <div className="min-h-screen px-4 py-20 text-center">
        <div className="text-4xl mb-4">🏆</div>
        <div className="text-white/50 text-sm">Torneo no encontrado</div>
        <Link href="/tournaments/paid" className="mt-4 inline-block text-xs text-blue-400">← Volver</Link>
      </div>
    </Protected>
  );

  const t           = tournament;
  const isPaid      = myEntry?.paymentStatus === "paid";
  const isPending   = myEntry?.paymentStatus === "pending";
  const isRefunded  = myEntry?.paymentStatus === "refunded";
  const isOpen      = t.status === "open";
  const isCancelled = t.status === "cancelled";
  const isFinished  = t.status === "finished";
  const canJoin     = isOpen && !isPaid && !isPending;
  const minReached  = t.participantCount >= t.minPlayers;
  const progressPct = Math.min((t.participantCount / t.maxPlayers) * 100, 100);
  const minPct      = (t.minPlayers / t.maxPlayers) * 100;
  const totalPrize  = t.prizes.reduce((s, p) => s + p, 0);

  return (
    <Protected>
      <div className="min-h-screen px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">

          <button onClick={() => router.push("/tournaments/paid")}
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition mb-1">
            ← Torneos de Pago
          </button>

          {/* Banners */}
          {entryResult === "success" && isPaid && (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/8 px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <div className="text-sm font-black text-emerald-300">¡Inscripción confirmada!</div>
                <div className="text-xs text-white/40 mt-0.5">Tu pago fue procesado. Ya estás participando.</div>
              </div>
            </div>
          )}
          {entryResult === "cancelled" && (
            <div className="rounded-2xl border border-white/10 bg-white/4 px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">↩️</span>
              <div>
                <div className="text-sm font-semibold text-white/60">Pago cancelado</div>
                <div className="text-xs text-white/30 mt-0.5">No se realizó ningún cargo.</div>
              </div>
            </div>
          )}
          {isCancelled && (
            <div className="rounded-2xl border border-red-400/20 bg-red-500/6 px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">❌</span>
              <div>
                <div className="text-sm font-black text-red-300">Torneo cancelado</div>
                <div className="text-xs text-white/40 mt-0.5">No se alcanzó el mínimo. Todos los pagos fueron reembolsados.</div>
              </div>
            </div>
          )}

          {/* Main card */}
          <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
            <div className="h-[2px] w-full bg-gradient-to-r from-amber-400/0 via-amber-400/60 to-amber-400/0" />
            <div className="px-5 py-5">

              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="rounded-md border border-white/8 bg-white/4 px-2 py-px text-[10px] font-black text-white/40 uppercase">{t.sport}</span>
                    <span className="text-[10px] text-white/25">{t.weekId}</span>
                  </div>
                  <h1 className="text-xl font-black text-white">{t.title}</h1>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-3xl font-black text-amber-300">{fmtUsd(t.entryFee)}</div>
                  <div className="text-[10px] text-white/30">por entrada</div>
                </div>
              </div>

              {/* Prizes */}
              <div className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-2.5">Premios en efectivo</div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {t.prizes.slice(0, 3).map((prize, i) => (
                    <div key={i} className={`rounded-xl border py-3 text-center ${i === 0 ? "border-amber-400/30 bg-amber-400/10" : i === 1 ? "border-slate-400/20 bg-slate-400/6" : "border-orange-400/20 bg-orange-400/6"}`}>
                      <div className="text-xl mb-0.5">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                      <div className={`text-lg font-black ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : "text-orange-300"}`}>{fmtUsd(prize)}</div>
                      <div className="text-[10px] text-white/25">#{i + 1}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-white/35">Premio total</span>
                  <span className="text-sm font-black text-white/60">{fmtUsd(totalPrize)}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: "Jugadores",  val: String(t.participantCount), sub: `mín ${t.minPlayers}` },
                  { label: "Tiempo",     val: timeLeft || "—",            sub: "para cierre" },
                  { label: "Pool mín.",  val: fmtUsd(t.entryFee * t.minPlayers), sub: "si se confirma" },
                ].map(({ label, val, sub }) => (
                  <div key={label} className="rounded-xl border border-white/6 bg-white/[0.02] p-3 text-center">
                    <div className="text-[10px] text-white/30 uppercase font-bold mb-1">{label}</div>
                    <div className="text-base font-black text-white/80">{val}</div>
                    <div className="text-[10px] text-white/25 mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>

              {/* Progress */}
              <div className="mb-5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{t.participantCount} / {t.maxPlayers} jugadores</span>
                  <span className={`font-bold ${minReached ? "text-emerald-400" : "text-amber-400/70"}`}>
                    {minReached ? "✓ Mínimo alcanzado" : `Faltan ${t.minPlayers - t.participantCount} para confirmar`}
                  </span>
                </div>
                <div className="relative h-2 w-full rounded-full bg-white/8 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full rounded-full bg-blue-400/50 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-amber-400/70" style={{ left: `${minPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/20">
                  <span>0</span>
                  <span className="text-amber-400/40">▲ mín ({t.minPlayers})</span>
                  <span>{t.maxPlayers}</span>
                </div>
              </div>

              {/* Dates */}
              <div className="rounded-xl border border-white/6 bg-white/[0.015] px-4 py-3 space-y-1.5 mb-5">
                {[
                  { label: "Cierre de registro", val: fmtDate(t.deadline) },
                  { label: "Inicio del torneo",  val: fmtDate(t.startDate) },
                  { label: "Fin del torneo",     val: fmtDate(t.endDate) },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-white/30">{label}</span>
                    <span className="text-white/55 font-semibold">{val}</span>
                  </div>
                ))}
              </div>

              {/* My entry */}
              {isPaid && (
                <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">✅</span>
                  <div>
                    <div className="text-sm font-black text-emerald-300">Ya estás inscrito</div>
                    <div className="text-xs text-white/35 mt-0.5">
                      {myEntry?.prizeRank ? `🏆 Ganaste #${myEntry.prizeRank} — ${fmtUsd(myEntry.prizeAmountCents ?? 0)}` : "Haz tus picks cuando el torneo inicie."}
                    </div>
                  </div>
                </div>
              )}
              {isRefunded && (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">↩️</span>
                  <div>
                    <div className="text-sm font-semibold text-white/60">Entrada reembolsada</div>
                    <div className="text-xs text-white/30 mt-0.5">El torneo fue cancelado. Revisa tu tarjeta.</div>
                  </div>
                </div>
              )}

              {error && <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">{error}</div>}

              {canJoin && (
                <>
                  <button onClick={handleJoin} disabled={joining}
                    className="w-full rounded-xl border border-amber-400/30 bg-amber-400/12 py-4 text-sm font-black text-amber-300 hover:bg-amber-400/18 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
                    {joining ? "Abriendo Stripe…" : `Entrar al torneo · ${fmtUsd(t.entryFee)}`}
                  </button>
                  <p className="mt-2.5 text-center text-[11px] text-white/20">
                    Pago seguro con Stripe · Reembolso automático si no se alcanzan {t.minPlayers} jugadores
                  </p>
                </>
              )}
              {isPending && !isPaid && (
                <button onClick={handleJoin} disabled={joining}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-4 text-sm font-bold text-white/50 hover:bg-white/8 transition">
                  {joining ? "Abriendo Stripe…" : "Completar pago pendiente →"}
                </button>
              )}
              {!isOpen && !isPaid && !isPending && !isCancelled && !isRefunded && (
                <div className="w-full rounded-xl border border-white/8 bg-white/[0.02] py-4 text-center text-sm text-white/30">Registro cerrado</div>
              )}
            </div>
          </div>

          {/* Rules */}
          <div className="rounded-2xl border border-white/6 bg-white/[0.015] px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-3">Reglas</div>
            <div className="space-y-2 text-xs text-white/40 leading-relaxed">
              <p>• Los picks se hacen igual que en cualquier torneo semanal de {t.sport}.</p>
              <p>• Tiebreaker: Puntos → Win Rate → Total Picks.</p>
              <p>• Si no se alcanzan <span className="text-white/60 font-semibold">{t.minPlayers} participantes</span> antes del cierre, se cancela y se reembolsa el 100%.</p>
              <p>• Pagos mayores a $600 pueden requerir verificación de identidad (IRS).</p>
              <p>• Al participar aceptas los términos de uso de Stat2Win.</p>
            </div>
          </div>

          {/* Final ranking */}
          {isFinished && t.finalRanking && t.finalRanking.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/6">
                <div className="text-sm font-black text-white">🏆 Resultados finales</div>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {t.finalRanking.slice(0, 10).map(({ uid, rank, points }) => {
                  const prize = t.prizes[rank - 1];
                  const isMe  = uid === user?.uid;
                  return (
                    <div key={uid} className={`flex items-center justify-between px-5 py-3 ${isMe ? "bg-emerald-500/6" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-white/50 w-6">
                          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
                        </span>
                        <span className={`text-sm font-semibold ${isMe ? "text-emerald-300" : "text-white/70"}`}>
                          {isMe ? "Tú" : `${uid.slice(0, 8)}…`}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-white/40">{points} pts</span>
                        {prize && <span className="font-black text-amber-300">{fmtUsd(prize)}</span>}
                      </div>
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
