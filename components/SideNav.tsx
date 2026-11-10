"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Desktop / tablet left navigation rail (lg+ only — below lg the app
// keeps its mobile shell: per-page headers + the dial, untouched).
//
// The rail is rendered by the root layout only for signed-in users, and
// it ALSO hides itself on the auth/legal/account-setup routes below: a
// signed-in student reading /privacy or finishing /verify shouldn't get
// the app chrome. Active state follows the pathname, so deep pages
// (/friends/<matchId>, /servers/<id>, /profile/<username>) light up
// their section.

const HIDDEN_PREFIXES: ReadonlyArray<string> = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/admin/forgot-password",
  "/verify",
  "/privacy",
  "/terms",
];

interface NavItem {
  label: string;
  href: string;
  // Exact-or-prefix match for the active state; Settings points at
  // /profile (settings live inside the profile page) but never claims
  // the active state — Profile owns /profile.
  matchPrefix: string | null;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { label: "Dial Home", href: "/", matchPrefix: null },
  { label: "Servers", href: "/servers", matchPrefix: "/servers" },
  { label: "Swipe Deck", href: "/swipe", matchPrefix: "/swipe" },
  { label: "Friends", href: "/friends", matchPrefix: "/friends" },
  { label: "Chirp", href: "/chirp", matchPrefix: "/chirp" },
  { label: "Inbox", href: "/inbox", matchPrefix: "/inbox" },
  { label: "Search", href: "/search", matchPrefix: "/search" },
  { label: "Profile", href: "/profile", matchPrefix: "/profile" },
  { label: "Settings", href: "/profile", matchPrefix: null },
];

export default function SideNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? "/";

  if (
    HIDDEN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  const items: NavItem[] = isOwner
    ? [
        ...NAV_ITEMS,
        { label: "Admin", href: "/admin", matchPrefix: "/admin" },
      ]
    : [...NAV_ITEMS];

  return (
    <nav
      aria-label="OneUco sections"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-neutral-900 bg-black px-4 py-6 lg:flex"
    >
      <Link href="/" className="px-2 pb-5">
        <span className="block text-xl font-semibold tracking-tight">
          OneUco
        </span>
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </span>
      </Link>
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.matchPrefix !== null &&
              (pathname === item.matchPrefix ||
                pathname.startsWith(`${item.matchPrefix}/`));
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-3 py-2.5 text-sm transition ${
              active
                ? "bg-white font-medium text-black"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
