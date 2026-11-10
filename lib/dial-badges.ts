import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfileByAccountId } from "@/lib/profile";
import { getTotalDmUnread } from "@/lib/social";
import { getTotalServerUnread } from "@/lib/servers";
import { getInboxUnreadCount } from "@/lib/inbox";
import { accentHex } from "@/lib/validation";
import { getTheme, type AppTheme } from "@/lib/themes";
import {
  getAdminTheme,
  getProfileThemeId,
} from "@/lib/server/theme-settings";
import type { DialBadges, DialThemePicker } from "@/components/DialNav";

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
  /** State for the dial's long-press interface mode (DialNav). */
  themePicker: DialThemePicker;
}

// Request-scoped via React cache(): on the dial home the shell
// (DialShellServer) and the page BOTH ask for this, and used to each
// pay the full computation (~5 queries) — the counts were computed
// twice per home render. With createClient() also cache()-shared
// (lib/supabase/server), both callers pass the identical client +
// accountId, so cache() collapses them into ONE computation per
// request. Data returned is unchanged.
export const getDialData = cache(computeDialData);

async function computeDialData(
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

  // App interface (lib/themes.ts): the dial wears the APPLIED
  // interface — the user's own pick (profiles.theme_id) over the
  // admin's app-wide default. When one applies, its accent replaces
  // the per-user profile accent on the dial and its skin tokens drive
  // the dial's face/ring/ticks (DialNav reads badges.theme). All
  // fail-soft: no interface → the dial exactly as before.
  let themePicker: DialThemePicker = {
    savedId: null,
    appliedId: null,
    defaultId: null,
  };
  let dialAccent = accent;
  let dialTheme: DialBadges["theme"];
  try {
    const [savedId, adminTheme] = await Promise.all([
      getProfileThemeId(supabase, accountId),
      getAdminTheme(),
    ]);
    const appliedTheme: AppTheme | null =
      getTheme(savedId) ?? adminTheme;
    themePicker = {
      savedId,
      appliedId: appliedTheme?.id ?? null,
      defaultId: adminTheme?.id ?? null,
    };
    if (appliedTheme) {
      dialAccent = appliedTheme.tokens.accent;
      dialTheme = {
        face: appliedTheme.tokens.dial.face,
        ring: appliedTheme.tokens.dial.ring,
        tick: appliedTheme.tokens.dial.tick,
        glow: appliedTheme.tokens.dial.glow,
        blur: appliedTheme.tokens.dial.blur,
        cap: appliedTheme.tokens.dial.cap,
        capRing: appliedTheme.tokens.dial.capRing,
        activeGlow: appliedTheme.tokens.dial.activeGlow,
        label: appliedTheme.tokens.dial.label,
        surface: appliedTheme.tokens.surface,
        surface2: appliedTheme.tokens.surface2,
        text: appliedTheme.tokens.text,
        dim: appliedTheme.tokens.muted,
        border: appliedTheme.tokens.border,
      };
    }
  } catch {
    // Interface data is decoration for the dial — never break it.
  }

  return {
    badges: {
      counts: { "/friends": dmUnread, "/servers": serverUnread },
      accentHex: dialAccent,
      theme: dialTheme,
    },
    inboxUnread,
    themePicker,
  };
}
