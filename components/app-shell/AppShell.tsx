"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/app-shell/Sidebar";
import Topbar from "@/components/app-shell/Topbar";
import { AppBackground } from "@/components/aurora-background";

function titleFromPath(pathname: string) {
  const p = (pathname || "/").split("?")[0];

  if (p.startsWith("/overview")) return "Overview";
  if (p.startsWith("/dashboard")) return "Dashboard";
  if (p.startsWith("/tournaments")) return "Tournaments";
  if (p.startsWith("/picks")) return "My Picks";
  if (p.startsWith("/leaderboard")) return "Leaderboard";
  if (p.startsWith("/store")) return "Store";
  if (p.startsWith("/redeems")) return "My Rewards";
  if (p.startsWith("/settings")) return "Settings";
  if (p.startsWith("/admin")) return "Admin";
  return "Overview";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  return (
    <AppBackground>
      <div className="min-h-screen flex">
        <Sidebar open={open} onClose={() => setOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setOpen(true)} title={title} />

          <main className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AppBackground>
  );
}