import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { isDiwaliLive } from "@/lib/server/diwali-settings";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount, getMySessionUser } from "@/lib/auth/my-account";
import { themeCssVars, type AppTheme } from "@/lib/themes";
import { resolveAppliedTheme } from "@/lib/server/theme-settings";
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

  // App interface (lib/themes.ts): the signed-in user's own pick
  // (profiles.theme_id) wins, then the owner's app-wide default from
  // /admin/appearance (app_settings 'theme'), else nothing — seasonal
  // auto, no stamp, the app exactly as it has always looked. Stamping
  // means data-* attributes + the token CSS variables inline on <html>;
  // the restyle itself lives in globals.css ("APP INTERFACES" section)
  // and the dial reads the same tokens via lib/dial-badges. Resolution
  // fails soft to no stamp on any error (e.g. before migration 0008).
  const account = signedIn ? await getMyAccount(supabase) : null;
  const appliedTheme: AppTheme | null = await resolveAppliedTheme(
    supabase,
    account?.id ?? null,
  );

  return (
    <html
      lang="en"
      className="dark"
      data-theme={appliedTheme?.id}
      data-theme-mode={appliedTheme?.mode}
      data-pattern={appliedTheme?.bgPattern}
      data-surface={appliedTheme?.surfaceStyle}
      style={
        appliedTheme
          ? (themeCssVars(appliedTheme) as unknown as CSSProperties)
          : undefined
      }
    >
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
