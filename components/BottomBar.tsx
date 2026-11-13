"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STOPS, type DialBadges } from "@/lib/nav-stops";

// Bottom tab bar — the app's navigation (owner's calls, 2026-11-11:
// "people need faster access to the app"; the rotary dial it
// replaced was retired outright the same night). The five stops
// are one tap away from every signed-in screen. The glyphs and
// per-stop hues come from the stops list (lib/nav-stops — the
// dial's own icon set, kept) and the unread badges are the same
// counts the dial showed (keyed by href, from lib/dial-badges).
// Rendered by DialShell for app routes only — auth, legal and admin
// routes never mount the shell, so they never see the bar.
//
// /inbox lights the Homies tab: the inbox is follow requests and
// people business, and it keeps the bar's five-tab shape honest
// instead of growing a sixth tab.

function activeStopIndex(pathname: string): number {
  // Derived from the STOPS order itself — never hardcode indices
  // here. (Bug, 2026-11-13: when the tab order changed to Fling,
  // Chirp, Tea, Homies, Profile, this function's frozen indices
  // kept pointing at the OLD order, so Fling lit up as Chirp,
  // Tea as Fling, and so on. Matching by href makes any future
  // reorder safe.)
  // /inbox lights the Homies tab (see the header note above).
  const path = pathname === "/inbox" ? "/friends" : pathname;
  return STOPS.findIndex(
    (stop) => path === stop.href || path.startsWith(`${stop.href}/`),
  );
}

export default function BottomBar({ badges }: { badges?: DialBadges }) {
  const pathname = usePathname() ?? "/";
  const active = activeStopIndex(pathname);
  const accent = badges?.accentHex ?? "#f5f5f5";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-800 bg-black/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {STOPS.map((stop, i) => {
          const isActive = i === active;
          const count = badges?.counts[stop.href] ?? 0;
          return (
            <Link
              key={stop.href}
              href={stop.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center gap-0.5 py-2 transition"
              style={{ color: isActive ? stop.accentVar : "#737373" }}
            >
              <span className="relative">
                <svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {stop.iconPaths.map((p, j) => (
                    <path key={j} d={p} />
                  ))}
                  {stop.iconFills
                    ? stop.iconFills.map((p, j) => (
                        <path
                          key={`f${j}`}
                          d={p}
                          fill="currentColor"
                          stroke="none"
                        />
                      ))
                    : null}
                </svg>
                {count > 0 ? (
                  <span
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              <span
                className={
                  isActive ? "text-[10px] font-semibold" : "text-[10px]"
                }
              >
                {stop.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
