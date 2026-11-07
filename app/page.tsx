import Link from "next/link";
import DialNav, { type DialBadges } from "@/components/DialNav";
import LiveClock from "@/components/LiveClock";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { isOwnerEmail } from "@/lib/server/owner";
import { getProfileByAccountId } from "@/lib/profile";
import { getTotalDmUnread } from "@/lib/social";
import { getTotalServerUnread } from "@/lib/servers";
import { getInboxUnreadCount } from "@/lib/inbox";
import { accentHex } from "@/lib/validation";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  let badges: DialBadges | undefined;
  let inboxUnread = 0;
  if (account) {
    // Independent reads run in parallel — the dial home used to wait on
    // them one by one, which made the home screen feel asleep.
    const [myProfile, dmUnread] = await Promise.all([
      getProfileByAccountId(supabase, account.id),
      getTotalDmUnread(supabase, account.id),
    ]);
    const accent = accentHex(myProfile?.accent_color);
    let serverUnread = 0;
    try {
      const admin = createAdminClient();
      const counts = await Promise.all([
        getTotalServerUnread(admin, account.id),
        getInboxUnreadCount(admin, account.id),
      ]);
      serverUnread = counts[0];
      inboxUnread = counts[1];
    } catch {
      // Badge counts are best-effort; the dial itself never breaks.
    }
    badges = {
      counts: { "/friends": dmUnread, "/servers": serverUnread },
      accentHex: accent,
    };
  }
  const accent = badges?.accentHex ?? "#171717";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-6">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">OneUco</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
        <LiveClock />
      </header>

      {/* Student search: OneUco ID (exact) or @username (partial). */}
      <form action="/search" method="get" className="mt-5 flex items-center gap-2">
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

      <div className="flex flex-1 items-center justify-center py-8">
        <DialNav badges={badges} />
      </div>

      <footer className="flex items-center justify-center gap-6 pb-2 text-xs text-neutral-500">
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
        {isOwnerEmail(user?.email) ? (
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
