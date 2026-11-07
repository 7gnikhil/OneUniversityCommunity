/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Conservative hardening headers on every response. Deliberately NO
  // Content-Security-Policy yet: a strict CSP needs the Supabase /
  // Google endpoints allow-listed and runtime testing first (follow-up).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    // Supabase Storage public buckets serve profile / chirp / server images.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
