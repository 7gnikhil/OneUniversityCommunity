import Link from "next/link";
import DialNav, {
  type DialBadges,
  type DialThemePicker,
} from "@/components/DialNav";
import DialTipCard from "@/components/DialTipCard";
import LiveClock from "@/components/LiveClock";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount, getMySessionUser } from "@/lib/auth/my-account";
import { isOwnerEmail } from "@/lib/server/owner";
import { getDialData } from "@/lib/dial-badges";
import { getProfileDialTipSeen } from "@/lib/server/theme-settings";

// Dial Home — the app's home screen (signed-in, verified users land here;
// the middleware sends everyone else to /login or the /verify shell).
//
// The round rotating dial with its five stops, the OneUco wordmark
// header and the small live clock line, on the black minimal theme.
// Unread badges are REAL counts computed here on the server: Friends =
// DM unread (messages.read_at), Servers = server messages newer than my
// per-server last_read_at, and the footer's Inbox link carries the inbox
// unread count. Zero counts render no badge.
export default async function DialHomePage() {
  const supabase = await createClient();
  // Request-cached: the session resolves locally (JWT claims) and the
  // account lookup runs once per render, however many components ask.
  const account = await getMyAccount(supabase);
  const sessionUser = await getMySessionUser(supabase);

  let badges: DialBadges | undefined;
  let themePicker: DialThemePicker | undefined;
  let inboxUnread = 0;
  let showDialTip = false;
  if (account) {
    // Shared with the desktop shell dial — one computation, both
    // placements (lib/dial-badges).
    const dialData = await getDialData(supabase, account.id);
    badges = dialData.badges;
    themePicker = dialData.themePicker;
    inboxUnread = dialData.inboxUnread;
    // One-time dial tip (migration 0010): shown only when the flag
    // reads back a clean FALSE — a failed read (pre-migration, or a
    // transient error) hides it entirely rather than risk a card
    // that could never be dismissed for good.
    showDialTip =
      (await getProfileDialTipSeen(supabase, account.id)) === false;
  }
  const accent = badges?.accentHex ?? "#171717";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-6 lg:py-10">
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

      {showDialTip ? <DialTipCard /> : null}

      <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
        <DialNav badges={badges} themePicker={themePicker} />
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
