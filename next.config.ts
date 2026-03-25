import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  // Asegurar que los archivos estáticos se sirvan correctamente
  staticPageGenerationTimeout: 1000,
};

export default nextConfig;