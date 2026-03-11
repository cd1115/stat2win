"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useUserEntitlements } from "@/lib/useUserEntitlements";

type NavItem = {
  href: string;
  label: string;
  icon?: string;
};

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const { isAdmin } = useUserEntitlements();

  const nav: NavItem[] = [
    { href: "/overview", label: "Overview" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/tournaments", label: "Tournaments" },
    { href: "/picks", label: "My Picks" },
    { href: "/leaderboard", label: "Leaderboard" },

    { href: "/store", label: "Store" },
    { href: "/redeems", label: "My Redeems" },

    { href: "/settings", label: "Settings" },
  ];

  const adminNav: NavItem[] = isAdmin
    ? [{ href: "/admin", label: "Admin", icon: "🛠️" }]
    : [];

  const allNav = [...nav, ...adminNav];

  return (
    <>
      {/* overlay mobile */}
      <button
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-label="Close sidebar overlay"
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-[280px] border-r border-white/10 bg-[#0A0C10] transition-transform",
          open ? "translate-x-0" : "-translate-x-full",

          "md:static md:translate-x-0 md:z-auto md:flex-shrink-0",
          "md:sticky md:top-0",
        )}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="text-[28px] font-bold tracking-tight text-white">
            Stat<span className="text-blue-400">2</span>Win
          </div>
        </div>

        {/* nav */}
        <nav className="px-3 py-4">
          <div className="space-y-1">
            {allNav.map((item) => {
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (window.innerWidth < 768) onClose();
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",

                    active
                      ? "bg-blue-600/20 text-white border border-blue-500/20"
                      : "text-white/70 hover:bg-white/5 hover:text-white",
                  )}
                >
                  {item.icon ? (
                    <span className="text-base">{item.icon}</span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-white/20" />
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#121418] p-4">
            <div className="text-xs font-semibold text-white/80">Tip</div>
            <div className="mt-1 text-xs text-white/55">
              Mientras armamos el dashboard, aquí después ponemos “Quick
              actions”.
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}