"use client";

/**
 * ============================================================
 * FREE PICKS ADMIN MANAGER
 * ============================================================
 *
 * ============================================================
 */

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

type FreePick = {
  id: string;
  title: string;
  league: string;
  game: string;
  pick: string;
  odds?: string;
  note?: string;
  result?: "pending" | "win" | "loss" | "push";
  active: boolean;
  createdAt?: any;
};

const EMPTY_FORM = {
  title: "",
  league: "NBA",
  game: "",
  pick: "",
  odds: "",
  note: "",
};

export default function FreePicksAdmin() {
  const [picks, setPicks] = useState<FreePick[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "freePicks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPicks(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as FreePick),
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function resetMsg() {
    setMsg(null);
    setErr(null);
  }

  async function handleAdd() {
    if (!form.title || !form.game || !form.pick || !form.league) {
      setErr("Title, League, Game y Pick son requeridos.");
      return;
    }

    setSaving(true);
    resetMsg();
    try {
      await addDoc(collection(db, "freePicks"), {
        title: form.title.trim(),
        league: form.league.trim().toUpperCase(),
        game: form.game.trim(),
        pick: form.pick.trim(),
        odds: form.odds.trim() || null,
        note: form.note.trim() || null,
        result: "pending",
        active: true,
        createdAt: serverTimestamp(),
      });
      setMsg("✅ Free pick publicado.");
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e: any) {
      setErr(e?.message ?? "Error al publicar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(pick: FreePick) {
    await updateDoc(doc(db, "freePicks", pick.id), { active: !pick.active });
  }

  async function handleSetResult(
    pick: FreePick,
    result: "win" | "loss" | "push" | "pending",
  ) {
    await updateDoc(doc(db, "freePicks", pick.id), { result });
  }

  async function handleDelete(pick: FreePick) {
    if (!confirm(`¿Eliminar el pick "${pick.pick}"?`)) return;
    await deleteDoc(doc(db, "freePicks", pick.id));
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20";
  const btnCls =
    "rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50";

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-semibold text-amber-200">
            🎯 Free Picks
          </div>
          <div className="text-sm text-white/60">
            Publica picks gratuitos que aparecen en el dashboard de los
            usuarios.
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-400/20"
        >
          {showForm ? "✕ Cancel" : "+ New Pick"}
        </button>
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          {msg}
        </div>
      )}

      {/* New Pick Form */}
      {showForm && (
        <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Title *
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputCls}
                placeholder='e.g. "NBA Free Pick"'
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                League *
              </label>
              <select
                value={form.league}
                onChange={(e) => setForm({ ...form, league: e.target.value })}
                className={inputCls}
              >
                <option value="NBA">NBA</option>
                <option value="MLB">MLB</option>
                <option value="PARLAY">PARLAY</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Game *</label>
              <input
                value={form.game}
                onChange={(e) => setForm({ ...form, game: e.target.value })}
                className={inputCls}
                placeholder='e.g. "NYK @ HOU"'
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Pick *</label>
              <input
                value={form.pick}
                onChange={(e) => setForm({ ...form, pick: e.target.value })}
                className={inputCls}
                placeholder='e.g. "HOU Moneyline"'
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Odds (optional)
              </label>
              <input
                value={form.odds}
                onChange={(e) => setForm({ ...form, odds: e.target.value })}
                className={inputCls}
                placeholder='e.g. "-110"'
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Note / Tip (optional)
              </label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className={inputCls}
                placeholder='e.g. "HOU 8-1 at home"'
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
          >
            {saving ? "Publishing…" : "🚀 Publish Pick"}
          </button>
        </div>
      )}

      {/* Picks List */}
      {loading ? (
        <div className="text-sm text-white/50">Loading…</div>
      ) : picks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-center text-white/40">
          No free picks published yet. Click "+ New Pick" to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {picks.map((pick) => (
            <div
              key={pick.id}
              className={`rounded-2xl border px-4 py-3 ${pick.active ? "border-white/10 bg-black/20" : "border-white/5 bg-black/10 opacity-60"}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {pick.game}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                        pick.league === "NBA"
                          ? "border-blue-500/30 bg-blue-500/20 text-blue-300"
                          : pick.league === "MLB"
                            ? "border-red-500/30 bg-red-500/20 text-red-300"
                            : "border-purple-500/30 bg-purple-500/20 text-purple-300"
                      }`}
                    >
                      {pick.league}
                    </span>
                    {!pick.active && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/40">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    ✅ {pick.pick}
                    {pick.odds ? ` (${pick.odds})` : ""}
                  </div>
                  {pick.note && (
                    <div className="mt-1 text-xs text-white/45">
                      💡 {pick.note}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Result selector */}
                  <select
                    value={pick.result ?? "pending"}
                    onChange={(e) =>
                      handleSetResult(pick, e.target.value as any)
                    }
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="pending">🔒 Pending</option>
                    <option value="win">✅ Win</option>
                    <option value="loss">❌ Loss</option>
                    <option value="push">🔁 Push</option>
                  </select>

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(pick)}
                    className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                      pick.active
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                        : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    {pick.active ? "Active" : "Inactive"}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(pick)}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 transition"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
