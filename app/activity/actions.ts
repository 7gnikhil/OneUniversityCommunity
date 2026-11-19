"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getInboxUnreadCount } from "@/lib/inbox";
import { getTotalServerUnread } from "@/lib/servers";
import { getTotalDmUnread } from "@/lib/social";
import { getNotifyDisplayName } from "@/lib/push";

// Activity feed for the shell (2026-11-20, owner's asks):
//  • getMyBadgeCountAction — the number the PWA icon badge shows
//    (components/AppBadgeSync): the SAME three counts the bottom
//    bar already shows in-app (DM unread + Tea unread + Inbox
//    unread), summed.
//  • getMyActivityAction — "what happened since X" for the in-app
//    toast stack (components/InAppToasts): pushes are suppressed
//    while a user is active in the app, so new DMs / Tea messages
//    / inbox items also surface as an in-app toast. Maya Jwalam
//    messages never toast (firehose rule, same as push).
// Everything fails soft: a count/toast problem never breaks a page.

export interface ActivityItem {
  id: string;
  title: string;
  body: string;
  url: string;
  at: string;
}

async function sessionAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  return { supabase, account };
}

export async function getMyBadgeCountAction(): Promise<number> {
  const ctx = await sessionAccount();
  if (!ctx) return 0;
  try {
    const [dm, tea, inbox] = await Promise.all([
      getTotalDmUnread(ctx.supabase, ctx.account.id),
      getTotalServerUnread(ctx.supabase, ctx.account.id),
      getInboxUnreadCount(ctx.supabase, ctx.account.id),
    ]);
    return (dm ?? 0) + (tea ?? 0) + (inbox ?? 0);
  } catch {
    return 0;
  }
}

function inboxUrl(kind: string, refId: string | null): string {
  if ((kind === "server_join" || kind === "group_invite") && refId) {
    return `/servers/${refId}`;
  }
  if (kind === "super_like") return "/swipe";
  if (kind === "new_join") return "/admin";
  return "/inbox";
}

export async function getMyActivityAction(
  sinceIso: string,
): Promise<ActivityItem[]> {
  const ctx = await sessionAccount();
  if (!ctx) return [];
  const me = ctx.account.id;
  const items: ActivityItem[] = [];
  try {
    const admin = createAdminClient();

    // Inbox items (matches, follows, joins, super likes…).
    const { data: inboxRows } = await admin
      .from("inbox_items")
      .select("id, kind, title, body, ref_id, created_at")
      .eq("recipient_id", me)
      .eq("is_read", false)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of (inboxRows ?? []) as Array<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      ref_id: string | null;
      created_at: string;
    }>) {
      items.push({
        id: `inbox-${row.id}`,
        title: row.title,
        body: row.body ?? "",
        url: inboxUrl(row.kind, row.ref_id),
        at: row.created_at,
      });
    }

    // New DMs — latest per conversation.
    const { data: myMatches } = await admin
      .from("matches")
      .select("id")
      .or(`account_a.eq.${me},account_b.eq.${me}`);
    const matchIds = ((myMatches ?? []) as Array<{ id: string }>).map(
      (row) => row.id,
    );
    if (matchIds.length > 0) {
      const { data: dmRows } = await admin
        .from("messages")
        .select("id, match_id, sender_id, body, image_url, created_at")
        .in("match_id", matchIds)
        .neq("sender_id", me)
        .gt("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(10);
      const seenMatches = new Set<string>();
      for (const row of (dmRows ?? []) as Array<{
        id: string;
        match_id: string;
        sender_id: string;
        body: string | null;
        image_url: string | null;
        created_at: string;
      }>) {
        if (seenMatches.has(row.match_id)) continue;
        seenMatches.add(row.match_id);
        const name = await getNotifyDisplayName(admin, row.sender_id);
        items.push({
          id: `dm-${row.id}`,
          title: name,
          body: row.body ? row.body.slice(0, 90) : "Sent you a photo",
          url: `/friends/${row.match_id}`,
          at: row.created_at,
        });
      }
    }

    // New Tea messages — latest per server, main channel excluded.
    const { data: myServers } = await admin
      .from("server_members")
      .select("server_id")
      .eq("account_id", me);
    const serverIds = ((myServers ?? []) as Array<{ server_id: string }>).map(
      (row) => row.server_id,
    );
    if (serverIds.length > 0) {
      const { data: serverRows } = await admin
        .from("servers")
        .select("id, name, is_main_channel")
        .in("id", serverIds);
      const serverMeta = new Map(
        ((serverRows ?? []) as Array<{
          id: string;
          name: string;
          is_main_channel: boolean;
        }>).map((row) => [row.id, row]),
      );
      const toastableIds = serverIds.filter(
        (id) => serverMeta.get(id) && !serverMeta.get(id)!.is_main_channel,
      );
      if (toastableIds.length > 0) {
        const { data: teaRows } = await admin
          .from("server_messages")
          .select("id, server_id, author_id, body, image_url, created_at")
          .in("server_id", toastableIds)
          .neq("author_id", me)
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(10);
        const seenServers = new Set<string>();
        for (const row of (teaRows ?? []) as Array<{
          id: string;
          server_id: string;
          author_id: string;
          body: string | null;
          image_url: string | null;
          created_at: string;
        }>) {
          if (seenServers.has(row.server_id)) continue;
          seenServers.add(row.server_id);
          const name = await getNotifyDisplayName(admin, row.author_id);
          items.push({
            id: `tea-${row.id}`,
            title: serverMeta.get(row.server_id)?.name ?? "Tea",
            body: row.body
              ? `${name}: ${row.body.slice(0, 80)}`
              : `${name} sent a photo`,
            url: `/servers/${row.server_id}`,
            at: row.created_at,
          });
        }
      }
    }
  } catch {
    // Toasts are a nicety; return whatever was gathered.
  }
  return items
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5);
}
