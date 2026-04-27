"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  doc,
  Timestamp,
} from "firebase/firestore";

// ─── Notification types & helpers ────────────────────────────────────────────

type NotifType =
  | "pick_win"
  | "pick_loss"
  | "pick_push"
  | "leaderboard_reward"
  | "daily_reward_claimed"
  | "welcome"
  | "system";

interface Notif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  createdAt: any;
  meta?: {
    sport?: string;
    homeTeam?: string;
    awayTeam?: string;
    market?: string;
    pointsAwarded?: number;
    result?: string;
  };
}

function timeAgo(ts: any): string {
  try {
    const d: Date = ts?.toDate?.() ?? (ts instanceof Date ? ts : new Date(ts));
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}

const SPORT_COLOR: Record<string, string> = {
  NBA: "#3B82F6",
  MLB: "#38BDF8",
  SOCCER: "#34D399",
  NFL: "#F59E0B",
};

function ResultIcon({ type }: { type: NotifType }) {
  if (type === "pick_win")
    return <span className="text-emerald-400 text-base">✓</span>;
  if (type === "pick_loss")
    return <span className="text-red-400 text-base">✕</span>;
  if (type === "pick_push")
    return <span className="text-amber-400 text-base">⟳</span>;
  if (type === "leaderboard_reward")
    return <span className="text-amber-400 text-base">🏆</span>;
  if (type === "daily_reward_claimed")
    return <span className="text-blue-400 text-base">⚡</span>;
  return <span className="text-white/40 text-base">📣</span>;
}

function NotifDot({ sport }: { sport?: string }) {
  const color = sport ? (SPORT_COLOR[sport] ?? "#6B7280") : "#6B7280";
  return (
    <span
      className="inline-flex h-1.5 w-1.5 rounded-full flex-shrink-0 mt-1.5"
      style={{ backgroundColor: color }}
    />
  );
}

const TEAM_LOGO_BASE: Record<string, string> = {
  NBA: "/teams",
  MLB: "/teams/mlb",
  SOCCER: "/teams/soccer",
  NFL: "/teams/nfl",
};

function TeamLogo({ team, sport }: { team?: string; sport?: string }) {
  const [failed, setFailed] = useState(false);
  if (!team) return null;
  const color = sport ? (SPORT_COLOR[sport] ?? "#6B7280") : "#6B7280";
  const base = sport ? (TEAM_LOGO_BASE[sport] ?? "/teams") : "/teams";
  const src = `${base}/${team.toUpperCase()}.png`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}35` }}
    >
      {!failed ? (
        <img
          src={src}
          alt={team}
          width={14}
          height={14}
          className="object-contain"
          onError={() => setFailed(true)}
          style={{ width: 16, height: 16, objectFit: "contain" }}
        />
      ) : null}
      <span className="text-[10px] font-black tracking-wider" style={{ color }}>
        {team}
      </span>
    </span>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell({ uid }: { uid: string }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(30),
    );
    return onSnapshot(q, (snap) => {
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Notif));
    });
  }, [uid]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  async function markAll() {
    const unreadNotifs = notifs.filter((n) => !n.read);
    if (!unreadNotifs.length) return;
    const batch = writeBatch(db);
    unreadNotifs.forEach((n) =>
      batch.update(doc(db, "notifications", n.id), { read: true }),
    );
    await batch.commit();
  }

  async function markOne(id: string) {
    const batch = writeBatch(db);
    batch.update(doc(db, "notifications", id), { read: true });
    await batch.commit();
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAll();
        }}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl transition",
          "border border-white/10 bg-white/5 hover:bg-white/10",
          open && "border-white/20 bg-white/10",
        )}
        aria-label="Notifications"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/70"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-[#0A0C10]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-white/10 bg-[#0E1117] shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div>
              <span className="text-sm font-bold text-white">Notifications</span>
              {unread > 0 && (
                <span className="ml-2 rounded-full bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[11px] text-white/40 hover:text-white/70 transition"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.05]">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/25">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mb-3 opacity-40"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span className="text-xs">No notifications yet</span>
              </div>
            ) : (
              notifs.map((n) => {
                const sport = n.meta?.sport;
                const home = n.meta?.homeTeam;
                const away = n.meta?.awayTeam;
                const pts = n.meta?.pointsAwarded;
                const accentColor = sport
                  ? (SPORT_COLOR[sport] ?? "#6B7280")
                  : "#6B7280";

                return (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markOne(n.id)}
                    className={cn(
                      "relative flex gap-3 px-4 py-3.5 transition cursor-default",
                      !n.read
                        ? "bg-white/[0.04] hover:bg-white/[0.06]"
                        : "hover:bg-white/[0.02]",
                    )}
                  >
                    {!n.read && (
                      <span
                        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                        style={{ backgroundColor: accentColor }}
                      />
                    )}

                    <div
                      className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border",
                        n.type === "pick_win"
                          ? "border-emerald-500/25 bg-emerald-500/10"
                          : n.type === "pick_loss"
                            ? "border-red-500/25 bg-red-500/10"
                            : n.type === "pick_push"
                              ? "border-amber-500/25 bg-amber-500/10"
                              : n.type === "leaderboard_reward"
                                ? "border-amber-400/25 bg-amber-400/10"
                                : "border-blue-500/25 bg-blue-500/10",
                      )}
                    >
                      <ResultIcon type={n.type} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span
                          className={cn(
                            "text-xs font-semibold leading-snug",
                            n.type === "pick_win"
                              ? "text-emerald-300"
                              : n.type === "pick_loss"
                                ? "text-red-300"
                                : n.type === "pick_push"
                                  ? "text-amber-300"
                                  : "text-white/80",
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="text-[10px] text-white/25 flex-shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>

                      {(home || away) && (
                        <div className="flex items-center gap-1 mb-1">
                          {away && <TeamLogo team={away} sport={sport} />}
                          {away && home && (
                            <span className="text-[10px] text-white/20">@</span>
                          )}
                          {home && <TeamLogo team={home} sport={sport} />}
                        </div>
                      )}

                      <p className="text-[11px] text-white/45 leading-snug line-clamp-2">
                        {n.body}
                      </p>

                      {pts != null && pts > 0 && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/8 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          +{pts} pts
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/8 px-4 py-2.5">
            <span className="text-[10px] text-white/20">
              {notifs.length} notification{notifs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export default function Topbar({
  title = "Home",
}: {
  title?: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [firestoreUsername, setFirestoreUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { plan, rewardPoints, loading } = useUserEntitlements();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) { setFirestoreUsername(null); setAvatarUrl(null); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setFirestoreUsername(data?.username ?? null);
        setAvatarUrl(data?.avatarUrl ?? null);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const username = useMemo(() => {
    if (!user) return "Account";
    return firestoreUsername || user.displayName || user.email?.split("@")[0] || "Account";
  }, [user, firestoreUsername]);

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login?from=logout");
  }

  const isPremium = plan === "premium";

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#09090B]/95 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-5">

        {/* Title */}
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-white/90">
          {title}
        </h1>

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          {user && (
            <>
              {/* Plan badge — hidden on mobile */}
              <span
                className={cn(
                  "hidden sm:inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-bold tracking-wide transition",
                  isPremium
                    ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border border-white/10 bg-white/5 text-white/45",
                )}
              >
                {loading ? "···" : isPremium ? "✦ PREMIUM" : "FREE"}
              </span>

              {/* RP balance — hidden on mobile */}
              <Link
                href="/redeems"
                className="hidden sm:inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/8 px-2.5 text-[11px] font-bold text-amber-300 hover:bg-amber-400/14 transition"
              >
                <span className="text-amber-400 text-[10px]">◆</span>
                {loading ? "···" : `${Number(rewardPoints).toLocaleString()} RP`}
              </Link>
            </>
          )}

          {/* Notification bell */}
          {user ? (
            <NotificationBell uid={user.uid} />
          ) : (
            <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/40">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          )}

          {/* User menu */}
          <div ref={wrapRef} className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full border pl-1 pr-2.5 transition",
                open
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/15",
              )}
              aria-label="User menu"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={username} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600/80 text-[11px] font-bold text-white flex-shrink-0">
                  {username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[120px] truncate text-xs font-medium sm:inline">
                {username}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={cn("transition-transform", open && "rotate-180")}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {open && (
              <div className="absolute right-0 z-[60] mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#0E1117] shadow-2xl shadow-black/60">
                {/* User info */}
                <div className="border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2.5 mb-1">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={username} className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-blue-500/40" />
                    ) : (
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/80 text-sm font-bold text-white">
                        {username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        @{username}
                      </div>
                      <div className="truncate text-[10px] text-white/40">
                        {user?.email || ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", isPremium ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-white/40")}>
                      {isPremium ? "✦ PREMIUM" : "FREE"}
                    </span>
                    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      ◆ {Number(rewardPoints).toLocaleString()} RP
                    </span>
                  </div>
                </div>

                {/* Navigation links */}
                <div className="px-2 py-1.5">
                  {[
                    { label: "Tournaments", sub: "NBA · MLB · Soccer", path: "/tournaments", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
                    { label: "My Picks", sub: "Weekly & daily picks", path: "/picks", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
                    { label: "Leaderboard", sub: "Rankings & standings", path: "/leaderboard", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                    { label: "Store", sub: "Redeem your RP", path: "/store", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> },
                    { label: "My Rewards", sub: "RP history", path: "/redeems", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
                    { label: "Subscription", sub: "Plans & billing", path: "/subscription", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
                    { label: "Settings", sub: "Account & preferences", path: "/settings", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
                  ].map(({ label, sub, path, svg }) => (
                    <button
                      key={path}
                      onClick={() => { setOpen(false); router.push(path); }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/6 group"
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/50 group-hover:text-white/80 transition">
                        {svg}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-white/80 group-hover:text-white transition leading-none mb-0.5">{label}</div>
                        <div className="text-[10px] text-white/30 leading-none">{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/8">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400/80 hover:bg-red-500/8 hover:text-red-300 transition"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
