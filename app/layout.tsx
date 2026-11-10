import type { Metadata } from "next";
import "./globals.css";
import { isDiwaliLive } from "@/lib/server/diwali-settings";
import { createClient } from "@/lib/supabase/server";
import { getMySessionUser } from "@/lib/auth/my-account";
import { isOwnerEmail } from "@/lib/server/owner";
import DiwaliBanner from "@/components/DiwaliBanner";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import SideNav from "@/components/SideNav";

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

  // The app shell needs to know whether anyone is signed in (desktop
  // rail + presence heartbeat). The session resolves locally (JWT
  // claims, request-cached — see lib/auth/my-account) so this costs no
  // Auth-server round trip; signed-out visitors get neither.
  const supabase = await createClient();
  const sessionUser = await getMySessionUser(supabase);
  const signedIn = sessionUser !== null;
  const isOwner = isOwnerEmail(sessionUser?.email);

  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-black text-white antialiased">
        {diwali ? <DiwaliBanner variant="app" /> : null}
        {signedIn ? <PresenceHeartbeat /> : null}
        {/*
          App shell:
          - Below lg: exactly the mobile shell the app shipped with —
            per-page headers and the round dial navigation (Servers ·
            Swipe Deck · Friends · Chirp · Profile) on the dial home.
          - lg and up: a left navigation rail (components/SideNav,
            sticky, viewport height) with the content flowing to its
            right in the remaining width. The rail hides itself on
            auth/legal/setup routes, and signed-out visitors never
            render it at all.
          Chat pages keep their h-dvh mains: inside this shell the
          content column starts at the top of the viewport and the rail
          is sticky rather than a fixed-height box, so a viewport-height
          chat still fits the screen exactly.
        */}
        <div className="lg:flex">
          {signedIn ? <SideNav isOwner={isOwner} /> : null}
          <div className="min-w-0 lg:flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
