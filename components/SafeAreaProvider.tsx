"use client";

import { useEffect } from "react";

export default function SafeAreaProvider() {
  useEffect(() => {
    // Reset zoom
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no');
    }
    document.documentElement.style.paddingTop = "env(safe-area-inset-top)";
    document.documentElement.style.background = "#05070B";
  }, []);

  return null;
}