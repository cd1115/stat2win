"use client";

import { useEffect } from "react";

export default function SafeAreaProvider() {
  useEffect(() => {
    const setup = async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#05070B" });
      } catch (e) {
        // no es nativo, ignorar
      }
    };
    setup();
  }, []);

  return null;
}