"use client";

import { useEffect } from "react";

export default function SafeAreaProvider() {
  useEffect(() => {
    document.documentElement.style.paddingTop = "env(safe-area-inset-top)";
    document.documentElement.style.background = "#05070B";
  }, []);

  return null;
}
