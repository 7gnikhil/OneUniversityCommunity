import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OneUco — One University Community",
  description:
    "OneUco is a students-only community app for JNTUH: swipe & match, servers, Chirp, friends chat and an inbox — for verified students only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-black text-white antialiased">
        {/*
          App shell (feature port):
          - OneUco wordmark header on every page
          - Round dial navigation (Servers · Swipe Deck · Friends · Chirp · Profile)
            with rotary-dial sound, plus notification-count badges for other pages
          - TODO: mount <DialNav /> and <InboxBell /> here once ported.
        */}
        {children}
      </body>
    </html>
  );
}
