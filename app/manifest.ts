import type { MetadataRoute } from "next";

// PWA manifest (re-engagement batch, 2026-11-11). Served by Next at
// /manifest.webmanifest and linked automatically. Installing OneUco
// to the Home Screen is what unlocks push notifications on iOS and
// the standalone app feel on Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OneUco — One University Community",
    short_name: "OneUco",
    description:
      "OneUco is a students-only community app: Fling matches, Tea hangouts, Chirp, friends chat and an inbox — for students of any college or university.",
    start_url: "/swipe",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
