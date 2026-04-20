"use client";

/**
 * PicksSidebarPanel — fully self-contained, no props needed.
 *
 * Desktop  → narrow tab pinned to the right viewport edge (always visible).
 *             Clicking it slides in/out a 260px panel.
 * Mobile   → floating pill button at bottom-center; opens a bottom sheet.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { getDayId } from "@/lib/day";
import { getWeekId } from "@/lib/week";
import { cn } from "@/lib/cn";

type PickResult = "pending" | "win" | "loss" | "push";

interface PickRow {
  id?: string;
  sport: string;
  market: string;
  pick: string;
  selection?: string | null;
  line?: number | null;
  result?: PickResult;
  pointsAwarded?: number;
}

const MARKET_LABEL: Record<string, string> = {
  moneyline: "ML",
  spread: "SP",
  ou: "O/U",
  total: "O/U",
};

const RESULT_STYLES: Record<PickResult, string> = {
  pending: "border-white/10 bg-white/5 text-white/50",
  win:     "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  loss:    "border-red-500/30 bg-red-500/10 text-red-300",
  push:    "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
};

const RESULT_ICON: Record<PickResult, string> = {
  pending: "🔒",
  win:     "✅",
  loss:    "❌",
  push:    "🔁",
};

const SPORT_EMOJI: Record<string, string> = {
  NBA: "🏀",
  MLB: "⚾",
  SOCCER: "⚽",
};

function selectionLabel(p: PickRow): string {
  const market = MARKET_LABEL[p.market] ?? p.market.toUpperCase();
  const line = p.line != null ? (p.line > 0 ? `+${p.line}` : `${p.line}`) : null;
  let base = (p.selection ?? p.pick ?? "").toUpperCase();
  if (p.pick === "over")  base = "Over";
  if (p.pick === "under") base = "Under";
  return line ? `${base} ${line} (${market})` : `${base} (${market})`;
}

function PickItem({ p }: { p: PickRow }) {
  const result: PickResult = (p.result as PickResult) ?? "pending";
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 text-xs transition", RESULT_STYLES[result])}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-white/80 truncate">
          {SPORT_EMOJI[p.sport] ?? "🎯"} {p.sport}
        </span>
        <span className="shrink-0">{RESULT_ICON[result]}</span>
      </div>
      <div className="mt-0.5 text-white/50 truncate">{selectionLabel(p)}</div>
      {result !== "pending" && (p.pointsAwarded ?? 0) > 0 && (
        <div className="mt-1 text-[10px] text-white/30">+{p.pointsAwarded} RP</div>
      )}
    </div>
  );
}

function Section({ title, sub, picks, loading }: {
  title: string; sub: string; picks: PickRow[]; loading: boolean;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{title}</p>
        <p className="text-[10px] text-white/20">{sub}</p>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/25">
          No picks yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {picks.map((p, i) => <PickItem key={p.id ?? i} p={p} />)}
        </div>
      )}
    </div>
  );
}

export default function PicksSidebarPanel() {
  const { user } = useAuth();
  const dayId  = useMemo(() => getDayId(), []);
  const weekId = useMemo(() => getWeekId(), []);

  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  const [dailyPicks,    setDailyPicks]    = useState<PickRow[]>([]);
  const [weeklyPicks,   setWeeklyPicks]   = useState<PickRow[]>([]);
  const [dailyLoading,  setDailyLoading]  = useState(true);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setDailyPicks([]); setDailyLoading(false); return; }
    setDailyLoading(true);
    const q = query(
      collection(db, "picks_daily"),
      where("uid", "==", user.uid),
      where("dayId", "==", dayId),
    );
    return onSnapshot(q,
      (snap) => { setDailyPicks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); setDailyLoading(false); },
      () => setDailyLoading(false),
    );
  }, [user?.uid, dayId]);

  useEffect(() => {
    if (!user?.uid) { setWeeklyPicks([]); setWeeklyLoading(false); return; }
    setWeeklyLoading(true);
    const q = query(
      collection(db, "picks"),
      where("uid", "==", user.uid),
      where("weekId", "==", weekId),
    );
    return onSnapshot(q,
      (snap) => { setWeeklyPicks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))); setWeeklyLoading(false); },
      () => setWeeklyLoading(false),
    );
  }, [user?.uid, weekId]);

  const totalPicks = dailyPicks.length + weeklyPicks.length;

  const panelContent = (
    <div className="flex flex-col gap-5 px-3 py-4">
      <Section title="Daily"  sub={dayId}  picks={dailyPicks}  loading={dailyLoading} />
      <div className="border-t border-white/8" />
      <Section title="Weekly" sub={weekId} picks={weeklyPicks} loading={weeklyLoading} />
    </div>
  );

  return (
    <>
      {/* ══════════════════════════════════════════════════
          DESKTOP — fixed tab on right viewport edge
          ══════════════════════════════════════════════════ */}
      <div className="hidden lg:block">

        {/* Slide-in panel — fixed, full height, right edge */}
        <div
          className={cn(
            "fixed top-0 right-0 z-40 h-screen flex",
            "transition-transform duration-300 ease-in-out",
            desktopOpen ? "translate-x-0" : "translate-x-[260px]",
          )}
        >
          {/* Toggle tab — always sticks out to the left of the panel */}
          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            aria-label={desktopOpen ? "Close picks panel" : "Open picks panel"}
            className={cn(
              "relative self-center flex flex-col items-center justify-center gap-1.5",
              "w-7 py-5 rounded-l-xl",
              "border border-r-0 border-white/10 bg-[#0E1117]",
              "hover:bg-white/8 transition-colors duration-150 cursor-pointer",
              "shadow-[-4px_0_16px_rgba(0,0,0,0.4)]",
            )}
          >
            {/* Arrow chevron */}
            <svg
              width="10" height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={cn(
                "text-white/40 transition-transform duration-300",
                desktopOpen ? "rotate-0" : "rotate-180",
              )}
            >
              <path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            {/* Vertical label */}
            <span
              className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25 select-none whitespace-nowrap"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              My Picks
            </span>

            {/* Live badge */}
            {totalPicks > 0 && (
              <span className="absolute -top-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white ring-2 ring-[#0E1117]">
                {totalPicks > 9 ? "9+" : totalPicks}
              </span>
            )}
          </button>

          {/* Panel body */}
          <div className="w-[260px] h-full flex flex-col border-l border-white/8 bg-[#0A0C10] shadow-[-8px_0_32px_rgba(0,0,0,0.5)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3 shrink-0 mt-14">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">My Picks</span>
                {totalPicks > 0 && (
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                    {totalPicks}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDesktopOpen(false)}
                className="rounded-lg p-1 text-white/25 hover:text-white/60 hover:bg-white/5 transition"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {panelContent}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          MOBILE — floating pill + bottom sheet
          ══════════════════════════════════════════════════ */}
      <div className="lg:hidden">
        {/* Pill */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className={cn(
            "fixed bottom-5 left-1/2 z-50 -translate-x-1/2",
            "flex items-center gap-2 rounded-full px-5 py-2.5",
            "border border-white/15 bg-[#0E1117] shadow-xl",
            "text-xs font-semibold text-white/70",
            "transition-all duration-150 active:scale-95",
          )}
        >
          <span>🎯</span>
          <span>My Picks</span>
          {totalPicks > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {totalPicks}
            </span>
          )}
          <span className="text-white/30 text-[10px]">{mobileOpen ? "▼" : "▲"}</span>
        </button>

        {/* Backdrop */}
        {mobileOpen && (
          <button
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-label="Close"
          />
        )}

        {/* Bottom sheet */}
        <div
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50",
            "rounded-t-2xl border-t border-white/10 bg-[#0A0C10]",
            "transition-transform duration-300 ease-out",
            mobileOpen ? "translate-y-0" : "translate-y-full",
          )}
          style={{ maxHeight: "70dvh" }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">My Picks</span>
              {totalPicks > 0 && (
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                  {totalPicks}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-white/30 hover:text-white/60 transition"
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(70dvh - 80px)" }}>
            {panelContent}
          </div>
        </div>
      </div>
    </>
  );
}
