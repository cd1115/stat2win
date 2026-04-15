"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/app-shell/Sidebar";
import Topbar from "@/components/app-shell/Topbar";

function titleFromPath(pathname: string) {
  const p = (pathname || "/").split("?")[0];

  if (p.startsWith("/overview")) return "Overview";
  if (p.startsWith("/dashboard")) return "Dashboard";
  if (p.startsWith("/tournaments")) return "Tournaments";
  if (p.startsWith("/picks")) return "My Picks";
  if (p.startsWith("/leaderboard")) return "Leaderboard";
  if (p.startsWith("/settings")) return "Settings";
  return "Overview";
}

const MemoSidebar = memo(Sidebar);
const MemoTopbar = memo(Topbar);

const MemoMain = memo(function MemoMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-6">
        {children}
      </div>
    </main>
  );
});

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  const toggleSidebar = useCallback(() => setOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MemoSidebar open={open} onClose={closeSidebar} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <MemoTopbar title={title} onMenu={toggleSidebar} />
        <MemoMain>{children}</MemoMain>
      </div>
    </div>
  );
}
