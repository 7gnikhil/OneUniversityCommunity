"use client";

import { usePathname } from "next/navigation";
import BottomBar from "@/components/BottomBar";
import type { DialBadges } from "@/components/DialNav";

// Navigation shell (owner's call, 2026-11-11). The dial is the home
// centrepiece — the brand moment — but it is no longer the way
// around the app: a bottom tab bar (components/BottomBar) is the
// primary navigation on every signed-in screen, home included, so
// every section is one tap away ("people need faster access").
//
// This replaces the 2026-11-10 arrangement where a compact dial
// docked in a left column inside sections on lg+ screens (and
// mobile sections had no persistent navigation at all). Sections
// now render full-width at every size — the pages carry their own
// max-w-md columns — with bottom padding so content clears the
// fixed bar. The home page pads its own <main> instead (its dial
// layout is exactly viewport-height), so the wrapper adds none.
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
