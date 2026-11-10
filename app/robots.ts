import type { MetadataRoute } from "next";

// Crawler rules (PageSpeed SEO fix, 2026-11-10): the public pages are
// crawlable; the signed-in app, admin and API surfaces are not. There
// is deliberately no sitemap line — the app has no sitemap yet, and
// inventing the URL would point crawlers at a 404. Reachability note:
// middleware.ts exempts /robots.txt from the session gate (below the
// /auth exemption), otherwise this route would redirect to /login like
// every other signed-out path.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/signup"],
      disallow: [
        "/admin/",
        "/api/",
        "/servers",
        "/swipe",
        "/friends",
        "/chirp",
        "/profile",
        "/inbox",
        "/search",
        "/forgot-password",
      ],
    },
  };
}
