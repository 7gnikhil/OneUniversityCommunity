"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Chirp sidebar (owner's call, 2026-11-13 — the Reddit pattern):
// Explore, Popular and Start a community, living beside the Chirp
// hub. On wide screens it is a sticky card at the left of the
// page; on phones — where a sidebar has no room to sit — the same
// list rides in a slide-over drawer opened by the Menu bar under
// the page header. One list, two shells, no duplicated links.
//
//   Explore           → /chirp        (the main page IS Explore —
//                                      composer + the full feed)
//   Popular           → /chirp/news   (the news thing lives there)
//   Campus Tweets     → /chirp/campus (its own page: posts with
//                                      photos, communities on top)
//   Radio             → /radio        (free music; the bottom tab
//                                      carries it too)
//   Start a community → /servers      (Tea — communities are made
//                                      and run there)

interface NavItem {
  href: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
}

const ITEMS: NavItem[] = [
  {
    href: "/chirp",
    label: "Explore",
    sub: "The all-college feed",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z" />
      </>
    ),
  },
  {
    href: "/chirp/news",
    label: "Popular",
    sub: "Live news & what's hot",
    icon: (
      <>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
  },
  {
    href: "/chirp/campus",
    label: "Campus Tweets",
    sub: "Post photos & chat on posts",
    icon: (
      <>
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </>
    ),
  },
  {
    href: "/radio",
    label: "Music Mitra",
    sub: "Free music + karaoke, in the background",
    icon: (
      <>
        <path d="M9 18V6l10-2v11" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="15" r="2.5" />
      </>
    ),
  },
  {
    href: "/servers",
    label: "Start a community",
    sub: "Opens Tea — create yours there",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-col gap-1" aria-label="Chirp sections">
      {ITEMS.map((item) => {
        // Explore is the hub itself: exact match only, or it would
        // light up on every /chirp/* page. The rest match by prefix.
        const isActive =
          item.href === "/chirp"
            ? pathname === "/chirp"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${
              isActive
                ? "bg-white/10 text-white"
                : "text-neutral-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0"
              aria-hidden
            >
              {item.icon}
            </svg>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold leading-tight">
                {item.label}
              </span>
              <span className="truncate text-xs text-neutral-500">
                {item.sub}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <p className="mt-4 border-t border-neutral-900 px-3 pt-3 text-[11px] leading-relaxed text-neutral-600">
      OneUco — One University Community
      <br />
      <Link href="/privacy" className="transition hover:text-neutral-400">
        Privacy
      </Link>
      {" · "}
      <Link href="/terms" className="transition hover:text-neutral-400">
        Terms
      </Link>
    </p>
  );
}

export default function ChirpSidebar() {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <>
      {/* Phone: the Menu bar that opens the drawer. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 self-start rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-600 lg:hidden"
        aria-haspopup="dialog"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Explore, Popular &amp; more
      </button>

      {/* Phone: the slide-over drawer. */}
      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Chirp menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-neutral-800 bg-neutral-950 p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-base font-bold tracking-tight">
                One<span className="text-amber-400">Uco</span>
                <span className="ml-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Chirp
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </div>
        </div>
      ) : null}

      {/* Wide screens: the sidebar proper, sticky beside the hub. */}
      <aside className="sticky top-6 hidden rounded-3xl border border-neutral-800 bg-neutral-950 p-3 lg:block">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
          Chirp
        </p>
        <NavList />
        <SidebarFooter />
      </aside>
    </>
  );
}
