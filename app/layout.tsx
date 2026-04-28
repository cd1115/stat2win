import "./globals.css";
import Providers from "./providers";
import SafeAreaProvider from "@/components/SafeAreaProvider";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stat2Win",
  description: "Pick winners. Earn points. Climb the leaderboard.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Stat2Win",
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ height: "100%", overflow: "hidden" }}>
      <head>
       <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Stat2Win" />
        <meta name="theme-color" content="#05070B" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body style={{ height: "100%", overflow: "hidden" }}>
        <Providers>
          <SafeAreaProvider />
          {children}
        </Providers>
      </body>
    </html>
  );
}