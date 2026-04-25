"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

function NavItem({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "block rounded-xl px-3 py-2 text-sm transition",
        active
          ? "bg-white/10 text-white"
          : "text-white/80 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isLoggedIn = !!user;
  const rightCtaHref = useMemo(() => (isLoggedIn ? "/dashboard" : "/login"), [isLoggedIn]);
  const rightCtaLabel = useMemo(() => (isLoggedIn ? "Dashboard" : "Start Playing"), [isLoggedIn]);

  async function handleLogout() {
    await signOut(auth);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight text-white">
            Stat<span className="text-blue-400">2</span>Win
          </span>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <NavItem href="/dashboard" label="Dashboard" />
          <NavItem href="/tournaments" label="Tournaments" />
          <NavItem href="/leaderboard" label="Leaderboard" />
          <NavItem href="/admin/games" label="Admin" />

          {!isLoggedIn ? (
            <Link
              href="/login"
              className="ml-2 inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/10"
            >
              Login
            </Link>
          ) : (
            <button
              onClick={handleLogout}
              className="ml-2 inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/10"
            >
              Logout
            </button>
          )}

          <Link
            href={rightCtaHref}
            className="ml-2 inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
          >
            {rightCtaLabel}
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href={rightCtaHref}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            {rightCtaLabel}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/90 transition hover:border-white/20 hover:bg-white/10"
          >
            <span className="relative block h-4 w-4">
              <span className="absolute left-0 top-0 block h-[2px] w-4 rounded bg-white/90" />
              <span className="absolute left-0 top-[6px] block h-[2px] w-4 rounded bg-white/90" />
              <span className="absolute left-0 top-[12px] block h-[2px] w-4 rounded bg-white/90" />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 bg-black/80 backdrop-blur md:hidden">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="grid gap-1">
              <NavItem href="/dashboard" label="Dashboard" onClick={() => setOpen(false)} />
              <NavItem href="/tournaments" label="Tournaments" onClick={() => setOpen(false)} />
              <NavItem href="/leaderboard" label="Leaderboard" onClick={() => setOpen(false)} />
              <NavItem href="/admin/games" label="Admin" onClick={() => setOpen(false)} />
              <div className="my-2 border-t border-white/10" />
              {!isLoggedIn ? (
                <NavItem href="/login" label="Login" onClick={() => setOpen(false)} />
              ) : (
                <button
                  onClick={handleLogout}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Logout
                </button>
              )}
              <NavItem href="/subscribe" label="Subscribe" onClick={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}