import type { Metadata } from "next";
import "./globals.css";
import { isDiwaliLive } from "@/lib/server/diwali-settings";
import { createClient } from "@/lib/supabase/server";
import { getMySessionUser } from "@/lib/auth/my-account";
import DiwaliBanner from "@/components/DiwaliBanner";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import DialShellServer from "@/components/DialShellServer";

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

  // The app shell needs to know whether anyone is signed in (dial
  // shell + presence heartbeat). The session resolves locally (JWT
  // claims, request-cached — see lib/auth/my-account) so this costs no
  // Auth-server round trip; signed-out visitors get neither.
  const supabase = await createClient();
  const sessionUser = await getMySessionUser(supabase);
  const signedIn = sessionUser !== null;

  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-black text-white antialiased">
        {diwali ? <DiwaliBanner variant="app" /> : null}
        {signedIn ? <PresenceHeartbeat /> : null}
        {/*
          App shell — the dial is the navigation on every screen size
          (owner's design; the SideNav rail shipped 2026-11-10 was
          rejected and removed the same day):
          - Home renders its own big dial, centred (360px on lg+).
          - Inside a section, on lg+ screens, components/DialShell
            puts a compact dial in a sticky left column and the section
            content in the right column; below lg the shell is a plain
            block and sections render exactly as on mobile.
          - Auth/legal/setup routes and signed-out visitors render
            bare — no shell at all.
          Chat pages keep their h-dvh mains: the shell's right column
          is an unconstrained block, so a viewport-height chat still
          fits the screen (while the Diwali banner is live it adds its
          height above the shell, as it did above every page before).
        */}
        {signedIn ? (
          <DialShellServer>{children}</DialShellServer>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
