import type { Metadata } from "next";
import "./globals.css";
import { isDiwaliLive } from "@/lib/server/diwali-settings";
import DiwaliBanner from "@/components/DiwaliBanner";

export const metadata: Metadata = {
  title: "OneUco — One University Community",
  description:
    "OneUco is a students-only community app for students everywhere: swipe & match, servers, Chirp, friends chat and an inbox — for students of any college or university.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Diwali launch theme: when live (auto window 8–12 Nov IST, or the
  // owner's /admin toggle), a slim gold banner sits above every page —
  // login, dial home and all sections. Fails soft to off.
  const diwali: boolean = await isDiwaliLive();

  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-black text-white antialiased">
        {diwali ? <DiwaliBanner variant="app" /> : null}
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
