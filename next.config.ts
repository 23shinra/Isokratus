import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: async () => {
    try {
      const { BUILD_ID } = await import("./src/lib/build-id");
      return BUILD_ID;
    } catch {
      return `build-${Date.now().toString(36)}`;
    }
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/build-id.json",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    },
    {
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        { key: "Cache-Control", value: "public, max-age=3600" },
      ],
    },
    {
      // HTML / RSC payloads — never keep a shell that points at old CSS hashes
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
      headers: [
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
      ],
    },
  ],
};

export default nextConfig;
