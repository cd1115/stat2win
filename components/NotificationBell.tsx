"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

type NotificationItem = {
  id: string;
  uid: string;
  type: string;
  title: string;
  body: string;
  read?: boolean;
  ctaUrl?: string | null;
  createdAt?: any;
  meta?: Record<string, any>;
};

function formatWhen(ts: any) {
  const date =
    ts?.toDate?.() instanceof Date
      ? ts.toDate()
      : ts?._seconds
        ? new Date(ts._seconds * 1000)
        : null;
  if (!date) return "Ahora";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;

  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Hace ${diffD} d`;

  return date.toLocaleDateString();
}

function getAccent(type: string, read?: boolean) {
  if (read) return "border-white/10 bg-white/[0.02]";
  if (type === "pick_win") return "border-emerald-500/40 bg-emerald-500/10";
  if (type === "pick_push") return "border-amber-500/40 bg-amber-500/10";
  if (type === "pick_loss") return "border-rose-500/40 bg-rose-500/10";
  if (type === "reward_points" || type === "daily_reward" || type === "leaderboard_reward") {
    return "border-yellow-500/40 bg-yellow-500/10";
  }
  return "border-sky-500/30 bg-sky-500/10";
}

export default function NotificationBell({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  async function loadNotifications() {
    if (!uid) return;
    setLoading(true);
    try {
      const functions = getFunctions(getApp(), "us-central1");
      const fn = httpsCallable(functions, "getMyNotifications");
      const res: any = await fn({ limit: 25 });
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (error) {
      console.error("notifications load failed", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!uid) return;
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [uid]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unreadCount = useMemo(
    () => items.filter((item) => item.read !== true).length,
    [items],
  );

  async function markOneRead(id: string) {
    try {
      const functions = getFunctions(getApp(), "us-central1");
      const fn = httpsCallable(functions, "markNotificationsRead");
      await fn({ ids: [id] });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    } catch (error) {
      console.error("mark notification read failed", error);
    }
  }

  async function markAllRead() {
    try {
      const functions = getFunctions(getApp(), "us-central1");
      const fn = httpsCallable(functions, "markNotificationsRead");
      await fn({ all: true });
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (error) {
      console.error("mark all notifications read failed", error);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-lg text-white transition hover:bg-white/[0.06]"
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-[380px] rounded-3xl border border-white/10 bg-[#0d1117] p-3 shadow-2xl shadow-black/40">
          <div className="mb-3 flex items-center justify-between px-2 py-1">
            <div>
              <div className="text-sm font-semibold text-white">Notificaciones</div>
              <div className="text-xs text-white/50">{unreadCount} sin leer</div>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              className="rounded-xl border border-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/[0.05]"
            >
              Marcar todas
            </button>
          </div>

          <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {loading && items.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                Cargando…
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
                Aún no tienes notificaciones.
              </div>
            )}

            {items.map((item) => {
              const accent = getAccent(item.type, item.read);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    await markOneRead(item.id);
                    if (item.ctaUrl) window.location.href = item.ctaUrl;
                  }}
                  className={`block w-full rounded-2xl border p-3 text-left transition hover:bg-white/[0.04] ${accent}`}
                >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{item.title}</div>
                    <div className="shrink-0 text-[11px] text-white/45">
                      {formatWhen(item.createdAt)}
                    </div>
                  </div>
                  <div className="text-sm leading-5 text-white/70">{item.body}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
