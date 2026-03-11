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

// ✅ Memo wrappers (no cambian tu Sidebar/Topbar)
const MemoSidebar = memo(Sidebar);
const MemoTopbar = memo(Topbar);

// ✅ Memo main wrapper: evita re-render pesado del contenido al abrir/cerrar el menú
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

  // ✅ Stable callbacks
  const onClose = useCallback(() => setOpen(false), []);
  const onMenu = useCallback(() => setOpen(true), []);

  return (
    // ✅ Fondo GLOBAL (no tocamos tu gradiente)
    <div className="min-h-screen bg-[#05070B] from-[#070A12] via-[#090B18] to-[#1B1230]">
      <div className="min-h-screen flex">
        <MemoSidebar open={open} onClose={onClose} />

        {/* min-w-0 evita que tablas/grids revienten layout */}
        <div className="flex-1 min-w-0 flex flex-col">
          <MemoTopbar onMenu={onMenu} title={title} />
          <MemoMain>{children}</MemoMain>
        </div>
      </div>
    </div>
  );
}