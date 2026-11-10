"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DialNav, {
  type DialBadges,
  type DialThemePicker,
} from "@/components/DialNav";

// The dial IS the navigation — on every screen size (owner's design,
// corrected 2026-11-10; this replaces the short-lived SideNav rail).
//
// - Home (/): nothing wraps the page — it renders its own big dial,
//   centred, exactly as designed (360px on lg+).
// - Inside any section, on lg+ screens: two columns. The dial, compact
//   (~190px), sits in a sticky LEFT column under a small OneUco
//   wordmark and stays put as the navigation; the section's content
//   renders in the RIGHT column. Tapping a stop spins it and navigates
//   (DialNav's behaviour); the stop for the current route rests at the
//   notch.
// - Below lg: the wrapper is a plain block and the left column is
//   hidden — sections render full-screen exactly as on mobile.
//
// Auth / legal / setup routes never get the shell, even on desktop.
// Admin routes never get it either: the admin area carries its own
// header/nav (back-to-Admin links, "View site"), and the shell's data
// (getDialData) is gated off under /admin in DialShellServer — this
// prefix is the client-side half of that gate, so the dial chrome
// also stays away when a soft navigation lands in Admin with the
// shell already mounted.

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
  themePicker,
  children,
}: {
  badges?: DialBadges;
  themePicker?: DialThemePicker;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";

  if (
    pathname === "/" ||
    HIDDEN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return <>{children}</>;
  }

  return (
    <div className="lg:flex lg:gap-6">
      <div className="hidden shrink-0 flex-col items-center lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[230px] lg:py-8">
        <Link href="/" className="pb-6 text-center">
          <span className="block text-xl font-semibold tracking-tight">
            OneUco
          </span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            One University Community
          </span>
        </Link>
        <DialNav
          badges={badges}
          size="shell"
          activePath={pathname}
          themePicker={themePicker}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
