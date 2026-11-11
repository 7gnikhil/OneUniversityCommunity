"use client";

import { usePathname } from "next/navigation";
import BottomBar from "@/components/BottomBar";
import type { DialBadges } from "@/lib/nav-stops";

// Navigation shell (owner's calls, 2026-11-11). A bottom tab bar
// (components/BottomBar) is the primary navigation on every
// signed-in screen, home included, so every section is one tap
// away ("people need faster access"). The rotary dial that used to
// anchor this shell — big on home, docked in a column inside
// sections — was retired the same night ("I think we don't need
// that dial anymore"); /home is a plain brand home now.
//
// Sections render full-width at every size — the pages carry their
// own max-w-md columns — with bottom padding so content clears the
// fixed bar. The home page pads its own <main> instead (its layout
// is exactly viewport-height), so the wrapper adds none.
//
// Auth / legal / setup routes never get the shell. Admin routes
// never get it either: the admin area carries its own header/nav,
// DialShellServer gates the data off under /admin, and this prefix
// check is the client-side half — the bar also stays away when a
// soft navigation lands in Admin with the shell already mounted.

const HIDDEN_PREFIXES: ReadonlyArray<string> = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/admin",
  "/verify",
  "/privacy",
  "/terms",
  "/auth",
];

export default function DialShell({
  badges,
  children,
}: {
  badges?: DialBadges;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  if (
    HIDDEN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={pathname === "/home" ? undefined : "pb-24"}>{children}</div>
      <BottomBar badges={badges} />
    </>
  );
}
