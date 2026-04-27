"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/app-shell/Sidebar";
import Topbar from "@/components/app-shell/Topbar";
import BottomTabBar from "@/components/app-shell/BottomTabBar";
import PicksSidebarPanel from "@/components/app-shell/PicksSidebarPanel";
import { AppBackground } from "@/components/aurora-background";

function titleFromPath(pathname: string) {
  const p = (pathname || "/").split("?")[0];
  if (p.startsWith("/overview")) return "Overview";
  if (p.startsWith("/dashboard")) return "Home";
  if (p.startsWith("/tournaments")) return "Tournaments";
  if (p.startsWith("/picks")) return "My Picks";
  if (p.startsWith("/leaderboard")) return "Leaderboard";
  if (p.startsWith("/store")) return "Store";
  if (p.startsWith("/redeems")) return "My Rewards";
  if (p.startsWith("/settings")) return "Profile";
  if (p.startsWith("/subscription")) return "Subscription";
  if (p.startsWith("/admin")) return "Admin";
  return "Home";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  return (
    <AppBackground>
      <div className="min-h-screen flex">
        {/* Sidebar — solo en desktop */}
        <div className="hidden md:block">
          <Sidebar open={true} onClose={() => {}} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={title} />

          <main className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-6">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
              {children}
            </div>
          </main>
        </div>

        {/* Picks panel — desktop right side */}
        <PicksSidebarPanel />
      </div>

      {/* Bottom Tab Bar — solo mobile */}
      <BottomTabBar />
    </AppBackground>
  );
}