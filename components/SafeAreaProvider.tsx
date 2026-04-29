"use client";

import { useEffect } from "react";

export default function SafeAreaProvider() {
  useEffect(() => {
    const resetZoom = () => {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      }
      document.documentElement.style.background = "#05070B";
    };

    resetZoom();

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