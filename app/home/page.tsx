import Link from "next/link";
import LiveClock from "@/components/LiveClock";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount, getMySessionUser } from "@/lib/auth/my-account";
import { isOwnerEmail } from "@/lib/server/owner";
import { getDialData } from "@/lib/dial-badges";

// Brand home — /home. This page used to centre on the rotary dial;
// the dial was retired on 2026-11-11 (owner's call: "I think we
// don't need that dial anymore" — the bottom tab bar is the
// navigation, and the app opens on Fling). What remains is the
// quiet front room: the wordmark, the live clock, student search,
// and the footer doors (Inbox with its real unread count, Admin
// for the owner, Settings). Reached by the "← OneUco" links on
// every section. Everyone who shouldn't be here never gets here
// (middleware: /login or /verify).
export default async function HomePage() {
  const supabase = await createClient();
  // Request-cached: the session resolves locally (JWT claims) and the
  // account lookup runs once per render, however many components ask.
  const account = await getMyAccount(supabase);
  const sessionUser = await getMySessionUser(supabase);

  let inboxUnread = 0;
  let accent = "#171717";
  if (account) {
    // One computation (lib/dial-badges): the shell's bottom bar
    // consumes the badges from the same request-cached call; here
    // only the inbox count and the accent are needed.
    const dialData = await getDialData(supabase, account.id);
    inboxUnread = dialData.inboxUnread;
    accent = dialData.badges?.accentHex ?? accent;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-6 pb-24 lg:pt-10 lg:pb-24">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">OneUco</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
        <LiveClock />
      </header>

      {/* Student search: OneUco ID (exact) or @username (partial). */}
      <form action="/search" method="get" className="mt-5 flex items-center gap-2 lg:mt-8">
        <input
          name="q"
          placeholder="Search @username or OneUco ID"
          maxLength={40}
          className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-900"
        >
          Search
        </button>
      </form>

      {/* The centre where the dial used to be: the brand, plainly. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center lg:py-10">
        <p className="text-4xl font-semibold tracking-tight">OneUco</p>
        <p className="text-sm text-neutral-400">
          Every college. One community.
        </p>
        <p className="max-w-[26ch] text-xs leading-relaxed text-neutral-600">
          Your people are on the bar below — Fling, Tea, Homies and
          Chirp are one tap away.
        </p>
      </div>

      <footer className="flex items-center justify-center gap-6 pb-2 text-xs text-neutral-500 lg:pb-4">
        <Link href="/inbox" className="relative transition hover:text-white">
          Inbox
          {inboxUnread > 0 ? (
            <span
              className="absolute -right-4 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {inboxUnread > 99 ? "99+" : inboxUnread}
            </span>
          ) : null}
        </Link>
        {isOwnerEmail(sessionUser?.email) ? (
          <Link href="/admin" className="transition hover:text-white">
            Admin
          </Link>
        ) : null}
        <Link href="/profile" className="transition hover:text-white">
          Settings
        </Link>
      </footer>
    </main>
  );
}
