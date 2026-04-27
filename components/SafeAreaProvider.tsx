"use client";

import { useEffect } from "react";

export default function SafeAreaProvider() {
  useEffect(() => {
    // Reset zoom
    const resetZoom = () => {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      }
      document.documentElement.style.paddingTop = "env(safe-area-inset-top)";
      document.documentElement.style.background = "#05070B";
    };

    resetZoom();

    // Also reset on visibility change (when app comes back from background)
    document.addEventListener('visibilitychange', resetZoom);
    window.addEventListener('focus', resetZoom);
    window.addEventListener('pageshow', resetZoom);

    return () => {
      document.removeEventListener('visibilitychange', resetZoom);
      window.removeEventListener('focus', resetZoom);
      window.removeEventListener('pageshow', resetZoom);
    };
  }, []);

  return null;
}