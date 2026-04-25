// @ts-nocheck
"use client";

import React from "react";

/**
 * GamePickRow (anti-spam)
 * ✅ Solo permite pickear si existe g.id (doc.id estable)
 * ❌ NO usa g.gameId como fallback (porque suele ser timestamp y crea duplicados)
 */

type Market = "moneyline" | "spread" | "ou";
type Selection = "HOME" | "AWAY" | "OVER" | "UNDER";

function fmtLine(n: number | null | undefined) {
  if (typeof n !== "number") return "—";
  return n > 0 ? `+${n}` : `${n}`;
}
function fmtOdds(n: number | null | undefined) {
  if (typeof n !== "number") return "";
  return n > 0 ? `+${n}` : `${n}`;
}
function key(gameId: string, market: Market) {
  return `${gameId}:${market}`;
}

function cellBtnClass(active: boolean, disabled: boolean) {
  if (disabled) {
    return "rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left opacity-50 cursor-not-allowed";
  }
  return [
    "rounded-2xl border px-3 py-3 text-left transition",
    active
      ? "border-blue-400/40 bg-blue-500/10 shadow-[0_0_0_1px_rgba(255,255,255,.06)]"
      : "border-white/10 bg-black/20 hover:bg-white/5",
  ].join(" ");
}

function normalizePick(raw: any): Selection | null {
  const sel = raw?.selection ?? raw?.Selection ?? null;
  if (sel === "HOME" || sel === "AWAY" || sel === "OVER" || sel === "UNDER") return sel;

  const p = raw?.pick ?? raw?.Pick ?? null;
  if (p === "home") return "HOME";
  if (p === "away") return "AWAY";
  if (p === "over") return "OVER";
  if (p === "under") return "UNDER";

  return null;
}

export default function GamePickRow(props: any) {
  const { g, picks, onPick, savingKey, onInvalidPick } = props;

  // ✅ SOLO id estable (doc.id)
  const stableGameId = g?.id ?? "";

  // Si no hay id válido, NO dejamos pickear (evita spam de docs con timestamps)
  if (!stableGameId) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="text-sm text-amber-200 font-semibold">⚠️ Game sin id estable</div>
        <div className="mt-1 text-xs text-amber-200/80">
          Este juego no trae <code>id</code> (doc.id). No se puede pickear para evitar duplicados.
          <br />
          Arregla el listener de <code>games</code> para mapear <code>{`{ ...data, id: doc.id }`}</code>.
        </div>
      </div>
    );
  }

  const status = String(g?.status ?? "scheduled").toLowerCase();
  const closed = status === "inprogress" || status === "final" || status === "live";

  const awayTeam = g?.awayTeam ?? "Away";
  const homeTeam = g?.homeTeam ?? "Home";

  const mlPick = normalizePick(picks?.get?.(key(stableGameId, "moneyline")));
  const spPick = normalizePick(picks?.get?.(key(stableGameId, "spread")));
  const ouPick = normalizePick(picks?.get?.(key(stableGameId, "ou")));

  const busyML = savingKey === key(stableGameId, "moneyline");
  const busySP = savingKey === key(stableGameId, "spread");
  const busyOU = savingKey === key(stableGameId, "ou");

  const hasSpread = typeof g?.spreadHome === "number" || typeof g?.spreadAway === "number";
  const hasTotal = typeof g?.totalLine === "number";

  function guardPick(market: Market) {
    // O/U se puede combinar con todo
    if (market === "ou") return true;

    // No permitir ML + Spread al mismo tiempo
    const hasML = !!mlPick;
    const hasSP = !!spPick;

    if (market === "moneyline" && hasSP) {
      onInvalidPick?.(
        "No puedes combinar Moneyline y Spread en el mismo juego. Quita el pick de Spread (My Picks) y luego selecciona Moneyline.",
      );
      return false;
    }
    if (market === "spread" && hasML) {
      onInvalidPick?.(
        "No puedes combinar Spread y Moneyline en el mismo juego. Quita el pick de Moneyline (My Picks) y luego selecciona Spread.",
      );
      return false;
    }
    return true;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-white/60">{g?.startLabel ?? ""}</div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
            {status.toUpperCase()}
          </span>
          {closed ? (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200">
              Locked
            </span>
          ) : (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              Open
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_180px_180px_160px] gap-3">
        <div />
        <div className="text-xs font-semibold text-white/60">Handicap</div>
        <div className="text-xs font-semibold text-white/60">Total</div>
        <div className="text-xs font-semibold text-white/60">Moneyline</div>

        {/* AWAY */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{awayTeam}</div>
          </div>
        </div>

        <button
          disabled={closed || busySP || !hasSpread}
          onClick={() =>
            guardPick("spread") &&
            onPick?.({
              gameId: stableGameId,
              market: "spread",
              selection: "AWAY",
              line: typeof g?.spreadAway === "number" ? g.spreadAway : null,
            })
          }
          className={cellBtnClass(spPick === "AWAY", closed || busySP || !hasSpread)}
        >
          <div className="text-base font-semibold">{fmtLine(g?.spreadAway)}</div>
          <div className="text-sm text-white/70">{fmtOdds(g?.spreadAwayOdds)}</div>
        </button>

        <button
          disabled={closed || busyOU || !hasTotal}
          onClick={() =>
            onPick?.({
              gameId: stableGameId,
              market: "ou",
              selection: "OVER",
              line: typeof g?.totalLine === "number" ? g.totalLine : null,
            })
          }
          className={cellBtnClass(ouPick === "OVER", closed || busyOU || !hasTotal)}
        >
          <div className="text-base font-semibold">O {g?.totalLine ?? "—"}</div>
          <div className="text-sm text-white/70">{fmtOdds(g?.totalOverOdds)}</div>
        </button>

        <button
          disabled={closed || busyML}
          onClick={() =>
            guardPick("moneyline") &&
            onPick?.({ gameId: stableGameId, market: "moneyline", selection: "AWAY", line: null })
          }
          className={cellBtnClass(mlPick === "AWAY", closed || busyML)}
        >
          <div className="text-base font-semibold">{fmtOdds(g?.moneylineAway)}</div>
        </button>

        {/* HOME */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{homeTeam}</div>
          </div>
        </div>

        <button
          disabled={closed || busySP || !hasSpread}
          onClick={() =>
            guardPick("spread") &&
            onPick?.({
              gameId: stableGameId,
              market: "spread",
              selection: "HOME",
              line: typeof g?.spreadHome === "number" ? g.spreadHome : null,
            })
          }
          className={cellBtnClass(spPick === "HOME", closed || busySP || !hasSpread)}
        >
          <div className="text-base font-semibold">{fmtLine(g?.spreadHome)}</div>
          <div className="text-sm text-white/70">{fmtOdds(g?.spreadHomeOdds)}</div>
        </button>

        <button
          disabled={closed || busyOU || !hasTotal}
          onClick={() =>
            onPick?.({
              gameId: stableGameId,
              market: "ou",
              selection: "UNDER",
              line: typeof g?.totalLine === "number" ? g.totalLine : null,
            })
          }
          className={cellBtnClass(ouPick === "UNDER", closed || busyOU || !hasTotal)}
        >
          <div className="text-base font-semibold">U {g?.totalLine ?? "—"}</div>
          <div className="text-sm text-white/70">{fmtOdds(g?.totalUnderOdds)}</div>
        </button>

        <button
          disabled={closed || busyML}
          onClick={() =>
            guardPick("moneyline") &&
            onPick?.({ gameId: stableGameId, market: "moneyline", selection: "HOME", line: null })
          }
          className={cellBtnClass(mlPick === "HOME", closed || busyML)}
        >
          <div className="text-base font-semibold">{fmtOdds(g?.moneylineHome)}</div>
        </button>
      </div>

      {(!hasSpread || !hasTotal) && (
        <div className="mt-3 text-xs text-white/50">
          {!hasSpread ? "Spread: no line yet. " : ""}
          {!hasTotal ? "Total: no line yet." : ""}
        </div>
      )}
    </div>
  );
}
