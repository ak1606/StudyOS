/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  // Don't expose the framework in response headers
  poweredByHeader: false,

  // Gzip compression at the Node server layer
  compress: true,

  // Tree-shake large packages — eliminates dead icon/chart code at build time
  experimental: {
    optimizePackageImports: [
      "recharts",
      "lucide-react",
      "@tanstack/react-query",
      "react-force-graph-2d",
      "daisyui",
    ],
  },

  // Modern image formats
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400, // 24 h
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    remotePatterns: [
      // Supabase storage (profile pics, course covers)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  async headers() {
    return [
      {
        // Security headers on every response
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",         value: "DENY" },
          { key: "X-XSS-Protection",        value: "1; mode=block" },
          { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",      value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Immutable cache for Next.js static chunks (hashed filenames)
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Short cache for HTML pages — always revalidate
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
