"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

export default function Topbar({
  onMenu,
  title = "Dashboard",
}: {
  onMenu: () => void;
  title?: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const { plan, rewardPoints, loading } = useUserEntitlements();

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

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
    return user.displayName || user.email?.split("@")[0] || "Account";
  }, [user]);

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login?from=logout");
  }

  return (
   <header
  className={cn(
    "sticky top-0 z-40 h-16 border-b border-white/10",
    "bg-[#0A0C10] backdrop-blur-xl",
  )}
>
      <div className="flex h-full items-center justify-between gap-3 px-5 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onMenu}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:text-white md:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <>
              <span className="hidden sm:inline-flex h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs text-white/75">
                {loading ? "Loading..." : `Plan: ${String(plan).toUpperCase()}`}
              </span>

              <Link
                href="/redeems"
                className={cn(
                  "hidden sm:inline-flex h-9 items-center rounded-full px-3 text-xs font-medium transition",
                  "border border-amber-300/20 bg-amber-400/10 text-amber-200",
                  "hover:bg-amber-400/15",
                )}
              >
                {loading
                  ? "Rewards..."
                  : `${Number(rewardPoints).toLocaleString()} RP`}
              </Link>
            </>
          )}

          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/75 transition hover:text-white"
            aria-label="Notifications"
          >
            <span>🔔</span>
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div ref={wrapRef} className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3",
                "text-white/80 transition hover:text-white",
              )}
              aria-label="User menu"
            >
              <span className="text-white/60">👤</span>
              <span className="hidden max-w-[140px] truncate text-sm sm:inline">
                {username}
              </span>
            </button>

            {open && (
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-xl backdrop-blur">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="truncate text-sm font-medium text-white">
                    {user?.displayName || "Account"}
                  </div>
                  <div className="truncate text-xs text-white/50">
                    {user?.email || "Not signed in"}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setOpen(false);
                    router.push("/redeems");
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-white/80 hover:bg-white/5"
                >
                  My Rewards
                </button>

                <button
                  onClick={() => {
                    setOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full px-4 py-3 text-left text-sm text-white/80 hover:bg-white/5"
                >
                  Settings
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm text-red-300 hover:bg-white/5"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}