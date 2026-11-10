import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfileByAccountId } from "@/lib/profile";
import { getTotalDmUnread } from "@/lib/social";
import { getTotalServerUnread } from "@/lib/servers";
import { getInboxUnreadCount } from "@/lib/inbox";
import { accentHex } from "@/lib/validation";
import type { DialBadges } from "@/components/DialNav";

// Server-side dial data — the ONE computation behind both dial
// placements: the big home dial (app/page.tsx) and the compact shell
// dial that sits in the left column inside sections on desktop
// (components/DialShellServer). Real unread counts: Friends = DM
// unread (messages.read_at), Servers = server messages newer than my
// per-server last_read_at, Inbox = inbox unread. Zero counts render no
// badge. Everything here is best-effort: badge failures degrade to no
// badges, never to a broken page.

export interface DialData {
  badges: DialBadges | undefined;
  inboxUnread: number;
}

export async function getDialData(
  supabase: SupabaseClient,
  accountId: string,
): Promise<DialData> {
  // Independent reads run in parallel — the dial home used to wait on
  // them one by one, which made the home screen feel asleep.
  const [myProfile, dmUnread] = await Promise.all([
    getProfileByAccountId(supabase, accountId),
    getTotalDmUnread(supabase, accountId),
  ]);
  const accent = accentHex(myProfile?.accent_color);
  let serverUnread = 0;
  let inboxUnread = 0;
  try {
    const admin = createAdminClient();
    const counts = await Promise.all([
      getTotalServerUnread(admin, accountId),
      getInboxUnreadCount(admin, accountId),
    ]);
    serverUnread = counts[0];
    inboxUnread = counts[1];
  } catch {
    // Badge counts are best-effort; the dial itself never breaks.
  }
  return {
    badges: {
      counts: { "/friends": dmUnread, "/servers": serverUnread },
      accentHex: accent,
    },
    inboxUnread,
  };
}
