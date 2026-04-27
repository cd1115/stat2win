"use client";

import React, { memo } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/app-shell/Sidebar";
import Topbar from "@/components/app-shell/Topbar";
import BottomTabBar from "@/components/app-shell/BottomTabBar";
import PicksSidebarPanel from "@/components/app-shell/PicksSidebarPanel";

function titleFromPath(pathname: string) {
  const p = (pathname || "/").split("?")[0];
  if (p.startsWith("/overview"))     return "Overview";
  if (p.startsWith("/dashboard"))    return "Home";
  if (p.startsWith("/tournaments"))  return "Tournaments";
  if (p.startsWith("/picks"))        return "My Picks";
  if (p.startsWith("/leaderboard"))  return "Leaderboard";
  if (p.startsWith("/store"))        return "Store";
  if (p.startsWith("/redeems"))      return "My Rewards";
  if (p.startsWith("/settings"))     return "Profile";
  if (p.startsWith("/subscription")) return "Subscription";
  if (p.startsWith("/admin"))        return "Admin";
  return "Home";
}

const MemoMain = memo(function MemoMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6 overflow-x-hidden">
        {children}
      </div>
    </main>
  );
});

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = titleFromPath(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar open={true} onClose={() => {}} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar title={title} />
        <MemoMain>{children}</MemoMain>
      </div>

      <PicksSidebarPanel />
      <BottomTabBar />
    </div>
  );
}