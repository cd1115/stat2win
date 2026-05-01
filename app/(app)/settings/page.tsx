"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import { cn } from "@/lib/cn";

const AVATARS = [
  "/avatars/18338.png",
  "/avatars/5900_7_03.png",
  "/avatars/7500_5_02.png",
  "/avatars/7600_4_10.png",
  "/avatars/9100_1_2_08.png",
];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function SettingsPage() {
  const router = useRouter();
  const [uid, setUid]                     = useState<string | null>(null);
  const [username, setUsername]           = useState("");
  const [email, setEmail]                 = useState("");
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(null);
  const [showPicker, setShowPicker]       = useState(false);
  const [savingAvatar, setSavingAvatar]   = useState(false);
  const { plan, rewardPoints, loading: entLoading, isAdmin } = useUserEntitlements();
  const isPremium = plan === "premium";

  // ── Channel modal state (admin only) ──
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [chType, setChType]   = useState<"announcement" | "update" | "info">("announcement");
  const [chTitle, setChTitle] = useState("");
  const [chBody, setChBody]   = useState("");
  const [chPinned, setChPinned] = useState(false);
  const [chSending, setChSending] = useState(false);
  const [chSuccess, setChSuccess] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUid(u?.uid ?? null);
      setEmail(u?.email ?? "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), snap => {
      if (snap.exists()) {
        const d = snap.data() as any;
        setUsername(d?.username ?? d?.displayName ?? "");
        setAvatarUrl(d?.avatarUrl ?? null);
      }
    });
    return () => unsub();
  }, [uid]);

  async function pickAvatar(url: string) {
    if (!uid) return;
    setSavingAvatar(true);
    try {
      await setDoc(doc(db, "users", uid), { avatarUrl: url, updatedAt: new Date() }, { merge: true });
      setAvatarUrl(url);
      setShowPicker(false);
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login?from=logout");
  }

  async function sendChannelMessage() {
    if (!chTitle.trim() || !chBody.trim()) return;
    setChSending(true);
    try {
      await addDoc(collection(db, "channel_messages"), {
        type: chType,
        title: chTitle.trim(),
        body: chBody.trim(),
        pinned: chPinned,
        createdAt: serverTimestamp(),
        authorUid: uid ?? "",
      });
      setChSuccess(true);
      setChTitle("");
      setChBody("");
      setChPinned(false);
      setTimeout(() => {
        setChSuccess(false);
        setShowChannelModal(false);
      }, 1500);
    } catch (err) {
      console.error("Error sending channel message:", err);
    } finally {
      setChSending(false);
    }
  }

  const displayName = username || email?.split("@")[0] || "User";

  return (
    <div className="min-h-screen px-4 py-6 max-w-lg mx-auto space-y-3">

      {/* ── Profile card ── */}
      <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">

        {/* Top accent */}
        <div className="h-[2px] w-full bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0" />

        <div className="px-5 py-6">
          {/* Avatar row */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative shrink-0">
              <button
                onClick={() => setShowPicker(v => !v)}
                className="group relative block"
                title="Cambiar avatar"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-white/12 group-hover:border-blue-400/40 transition-all duration-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-blue-600/30 border-2 border-blue-500/20 group-hover:border-blue-400/40 flex items-center justify-center text-2xl font-black text-blue-300 transition-all duration-200">
                    {initials(displayName)}
                  </div>
                )}
                {/* Edit overlay */}
                <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs font-bold text-white">✏️</span>
                </div>
              </button>
              {/* Pulse dot */}
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-[#0C0E14]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-white truncate">@{displayName}</div>
              <div className="text-xs text-white/35 truncate mt-0.5">{email}</div>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider",
                  isPremium
                    ? "bg-amber-400/12 text-amber-300 border-amber-400/25"
                    : "bg-white/5 text-white/35 border-white/10"
                )}>
                  {entLoading ? "···" : isPremium ? "✦ PREMIUM" : "FREE"}
                </span>
                <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-[11px] font-black text-amber-300">
                  ◆ {entLoading ? "···" : Number(rewardPoints).toLocaleString()} RP
                </span>
                {isAdmin && (
                  <span className="rounded-full bg-red-500/12 border border-red-500/25 px-2 py-0.5 text-[11px] font-bold text-red-300">
                    🛠️ Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Avatar picker ── */}
          {showPicker && (
            <div className="mb-2 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-blue-300/70 uppercase tracking-wider">Elige tu avatar</span>
                <button onClick={() => setShowPicker(false)} className="text-white/30 hover:text-white/60 transition text-xs">✕</button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(url => {
                  const isSelected = avatarUrl === url;
                  return (
                    <button
                      key={url}
                      onClick={() => pickAvatar(url)}
                      disabled={savingAvatar}
                      className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all duration-200 aspect-square",
                        isSelected
                          ? "border-blue-400 ring-2 ring-blue-400/30 scale-105"
                          : "border-white/10 hover:border-blue-400/50 hover:scale-105"
                      )}
                    >
                      <img src={url} alt="avatar" className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <span className="text-white text-base font-black">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {savingAvatar && (
                <p className="mt-2 text-center text-xs text-white/35 animate-pulse">Guardando…</p>
              )}
            </div>
          )}

          {/* Hint */}
          {!showPicker && (
            <p className="text-[11px] text-white/25 text-center">
              Toca tu foto para cambiar el avatar
            </p>
          )}
        </div>
      </div>

      {/* ── Menu items ── */}
      <div className="rounded-2xl border border-white/8 bg-[#0C0E14] overflow-hidden">
        {[
          {
            label: "Mi Cuenta",
            sub: "Perfil, username y dirección",
            href: "/settings/account",
            icon: "👤",
            iconBg: "bg-blue-400/8 border-blue-400/15 text-blue-300",
          },
          {
            label: "Subscription",
            sub: isPremium ? "Premium · Activo" : "Upgrade a Premium",
            href: "/subscription",
            icon: isPremium ? "✦" : "⭐",
            iconBg: isPremium ? "bg-amber-400/10 border-amber-400/20 text-amber-300" : "bg-white/5 border-white/8 text-white/50",
          },
          {
            label: "Store",
            sub: "Canjea tus RP por premios",
            href: "/store",
            icon: "🛒",
            iconBg: "bg-white/5 border-white/8 text-white/50",
          },
          {
            label: "My Redeems",
            sub: "Historial de tus canjes y RP",
            href: "/redeems",
            icon: "◆",
            iconBg: "bg-amber-400/8 border-amber-400/15 text-amber-400",
          },
          {
            label: "Leaderboard",
            sub: "Ver rankings semanales",
            href: "/leaderboard",
            icon: "🏆",
            iconBg: "bg-white/5 border-white/8 text-white/50",
          },
        ].map(({ label, sub, href, icon, iconBg }, i, arr) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors",
              i < arr.length - 1 && "border-b border-white/[0.06]"
            )}
          >
            <div className="flex items-center gap-3.5">
              <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-sm font-bold shrink-0", iconBg)}>
                {icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white/90">{label}</div>
                <div className="text-xs text-white/35 mt-0.5">{sub}</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/20 shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        ))}
      </div>

      {/* ── Admin section ── */}
      {isAdmin && (
        <div className="rounded-2xl border border-red-500/15 bg-red-500/4 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-500/10 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/12 border border-red-500/20 flex items-center justify-center text-sm">🛠️</div>
            <div>
              <div className="text-sm font-bold text-red-300">Admin Panel</div>
              <div className="text-[11px] text-white/30">Solo visible para ti</div>
            </div>
          </div>
          {[
            { label: "Admin Dashboard", sub: "Sync, finalize, manage users", href: "/admin", icon: "🎮" },
            { label: "Admin Games",     sub: "NBA, MLB & Soccer",            href: "/admin/games", icon: "🏆" },
            { label: "Admin Redeems",   sub: "Procesar canjes",              href: "/admin/redeems", icon: "🎁" },
          ].map(({ label, sub, href, icon }, i, arr) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between px-5 py-3.5 hover:bg-red-500/6 transition-colors",
                i < arr.length - 1 && "border-b border-red-500/8"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center justify-center text-sm shrink-0">{icon}</div>
                <div>
                  <div className="text-sm font-semibold text-white/80">{label}</div>
                  <div className="text-xs text-white/30 mt-0.5">{sub}</div>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/15 shrink-0">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          ))}

          {/* ── Publicar en Canal ── */}
          <button
            onClick={() => setShowChannelModal(true)}
            className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-blue-500/6 transition-colors border-t border-white/6"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/20 flex items-center justify-center text-sm shrink-0">📣</div>
              <div>
                <div className="text-sm font-semibold text-blue-300/90">Publicar en Canal</div>
                <div className="text-xs text-white/30 mt-0.5">Enviar mensaje a todos los usuarios</div>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-400/40 shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Channel message modal (admin only) ── */}
      {showChannelModal && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm pb-safe"
          onClick={e => { if (e.target === e.currentTarget) setShowChannelModal(false); }}
        >
          <div className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0E1117] px-5 pt-5 pb-8 space-y-4">

            {/* Handle bar */}
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/15" />

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/20 flex items-center justify-center text-base">📣</div>
                <div>
                  <div className="text-sm font-bold text-white">Publicar en Canal</div>
                  <div className="text-[11px] text-white/30">Visible para todos los usuarios</div>
                </div>
              </div>
              <button
                onClick={() => setShowChannelModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/40 hover:text-white/70 transition text-xs"
              >
                ✕
              </button>
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Tipo</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "announcement", label: "📣 Anuncio",       color: "amber" },
                  { value: "update",       label: "📊 Actualización", color: "blue" },
                  { value: "info",         label: "⚡ Novedad",       color: "emerald" },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setChType(opt.value)}
                    className={cn(
                      "rounded-xl border py-2 text-[11px] font-bold transition",
                      chType === opt.value
                        ? opt.color === "amber"   ? "border-amber-400/40 bg-amber-400/12 text-amber-300"
                          : opt.color === "blue"  ? "border-blue-400/40 bg-blue-400/12 text-blue-300"
                          :                         "border-emerald-400/40 bg-emerald-400/12 text-emerald-300"
                        : "border-white/8 bg-white/4 text-white/35 hover:bg-white/8"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Título</label>
              <input
                type="text"
                value={chTitle}
                onChange={e => setChTitle(e.target.value)}
                placeholder="ej. 🏆 NBA Paid Tournament — Mayo 2026"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-blue-400/40 focus:outline-none focus:ring-1 focus:ring-blue-400/20 transition"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Mensaje</label>
              <textarea
                value={chBody}
                onChange={e => setChBody(e.target.value)}
                rows={5}
                placeholder={"Escribe el mensaje aquí…\n\nUsa **texto** para negritas."}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-blue-400/40 focus:outline-none focus:ring-1 focus:ring-blue-400/20 transition resize-none"
              />
            </div>

            {/* Pin toggle */}
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/4 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base">📌</span>
                <div>
                  <div className="text-sm font-semibold text-white/80">Fijar mensaje</div>
                  <div className="text-[11px] text-white/30">Aparece siempre al inicio</div>
                </div>
              </div>
              <button
                onClick={() => setChPinned(v => !v)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                  chPinned ? "bg-amber-500 border-amber-400" : "bg-white/10 border-white/15"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  chPinned ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={sendChannelMessage}
              disabled={chSending || chSuccess || !chTitle.trim() || !chBody.trim()}
              className={cn(
                "w-full rounded-xl py-3.5 text-sm font-bold transition",
                chSuccess
                  ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : chTitle.trim() && chBody.trim()
                  ? "border border-blue-400/30 bg-blue-500/20 text-blue-200 hover:bg-blue-500/28 active:scale-[0.98]"
                  : "border border-white/8 bg-white/5 text-white/25 cursor-not-allowed"
              )}
            >
              {chSuccess ? "✓ Publicado con éxito" : chSending ? "Publicando…" : "📣 Publicar mensaje"}
            </button>
          </div>
        </div>
      )}

      {/* ── Sign out ── */}
      <button
        onClick={handleSignOut}
        className="w-full rounded-2xl border border-red-500/15 bg-red-500/6 py-3.5 text-sm font-semibold text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
      >
        Cerrar sesión
      </button>

      <p className="text-center text-[11px] text-white/15 pb-2">Stat2Win · v1.0</p>

    </div>
  );
}
