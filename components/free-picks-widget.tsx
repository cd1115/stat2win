"use client";

import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

type FreePick = {
  id: string;
  title: string;
  league: "NBA" | "MLB" | "PARLAY" | string;
  game: string;
  pick: string;
  odds?: string;
  note?: string;
  result?: "pending" | "win" | "loss" | "push";
  active: boolean;
  createdAt?: any;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function leagueBadgeCls(league: string) {
  const l = String(league ?? "").toUpperCase();
  if (l === "NBA") return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  if (l === "MLB") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (l === "PARLAY")
    return "bg-purple-500/20 text-purple-300 border-purple-500/30";
  return "bg-white/10 text-white/70 border-white/20";
}

function resultInfo(result?: string) {
  if (result === "win")
    return {
      label: "✅ WIN",
      cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    };
  if (result === "loss")
    return {
      label: "❌ LOSS",
      cls: "bg-red-500/20 text-red-300 border-red-500/30",
    };
  if (result === "push")
    return {
      label: "🔁 PUSH",
      cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    };
  return { label: "🔒 LIVE", cls: "bg-white/10 text-white/50 border-white/15" };
}

function buildShareText(pick: FreePick): string {
  return [
    `🏆 FREE PICK — ${pick.league}`,
    `🎯 ${pick.game}`,
    `✅ ${pick.pick}${pick.odds ? ` (${pick.odds})` : ""}`,
    pick.note ? `💡 ${pick.note}` : null,
    ``,
    `📲 Stat2Win App`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ─── Single Pick Card ─────────────────────────────────────────────────────────

function FreePickCard({ pick }: { pick: FreePick }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [imgCopied, setImgCopied] = useState(false);

  const res = resultInfo(pick.result);

  async function handleCopyText() {
    await navigator.clipboard.writeText(buildShareText(pick));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyImage() {
    // ✅ FIX: html2canvas no soporta oklab de Tailwind v4
    // Usamos Web Share API en móvil, o copiamos texto como fallback
    const text = buildShareText(pick);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setImgCopied(true);
      setTimeout(() => setImgCopied(false), 2000);
    } catch {
      // silent fail
    }
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0F1115] overflow-hidden">
      {/* Shareable card content */}
      <div
        ref={cardRef}
        className="bg-gradient-to-br from-[#0d1117] to-[#161b22] p-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest text-white/40 uppercase">
              Free Pick
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${leagueBadgeCls(pick.league)}`}
            >
              {pick.league}
            </span>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${res.cls}`}
          >
            {res.label}
          </span>
        </div>

        {/* Game */}
        <div className="mb-1 text-xs text-white/40 uppercase tracking-wider">
          Game
        </div>
        <div className="text-lg font-bold text-white mb-3">{pick.game}</div>

        {/* Pick */}
        <div className="mb-1 text-xs text-white/40 uppercase tracking-wider">
          Pick
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl font-extrabold text-white">{pick.pick}</span>
          {pick.odds && (
            <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-sm font-semibold text-white/70">
              {pick.odds}
            </span>
          )}
        </div>

        {/* Note */}
        {pick.note && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 mb-3">
            💡 {pick.note}
          </div>
        )}

        {/* Footer brand */}
        <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/10">
          <span className="text-xs font-bold tracking-widest text-white/30">
            STAT2WIN
          </span>
          <span className="text-xs text-white/25">stat2win.app</span>
        </div>
      </div>

      {/* Share buttons */}
      <div className="flex gap-2 border-t border-white/10 bg-[#121418] px-4 py-3">
        <button
          onClick={handleCopyText}
          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/5 transition"
        >
          {copied ? "✅ Copied!" : "📋 Copy Text"}
        </button>
        <button
          onClick={handleCopyImage}
          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/5 transition"
        >
          {imgCopied ? "✅ Shared!" : "📤 Share"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function FreePicksWidget() {
  const [picks, setPicks] = useState<FreePick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "freePicks"),
      where("active", "==", true),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setPicks(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) }) as FreePick,
          ),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#121418] p-5">
        <div className="text-sm text-white/50">Loading free picks…</div>
      </div>
    );
  }

  if (picks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-[#121418] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">
              🎯 Free Picks
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
              {picks.length} Today
            </span>
          </div>
          <p className="mt-1 text-xs text-white/50">
            Picks gratuitos del día — compártelos con tus amigos.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {picks.map((pick) => (
          <FreePickCard key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}
