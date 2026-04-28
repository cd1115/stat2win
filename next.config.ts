import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  staticPageGenerationTimeout: 1000,
  webpack: (config) => {
    // Ignore native-only Capacitor plugins that are not available in web/Vercel builds
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "@capgo/capacitor-purchases",
    ];
    return config;
  },
};

export default nextConfig;
