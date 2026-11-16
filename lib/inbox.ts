// Inbox data layer. The Inbox is a MERGE of:
//   - public.inbox_items — delivered notices (developer request
//     updates, admin notices, group-invite notices, verification
//     outcomes). Rows are written by server actions via the service role.
//   - public.group_invites addressed to me that I haven't joined yet
//     (actionable: accept/decline).
// Unread = unread inbox_items + pending direct invites. Invite entries
// clear by being acted on, not by viewing; inbox_items clear by viewing
// (the page marks them read after render).
// (The reveal_requests merge was removed on 2026-11-17 with the
// "show me your profile" feature; RevealRequestRow / REVEAL_COLUMNS
// remain only for the admin requests page's read-only history.)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupInviteRow, ServerRow } from "@/lib/servers";

export interface InboxItemRow {
  id: string;
  recipient_id: string;
  kind: string;
  title: string;
  body: string | null;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface RevealRequestRow {
  id: string;
  server_id: string;
  message_id: string | null;
  requester_id: string;
  poster_id: string;
  status: "pending" | "accepted" | "rejected" | "revoked";
  created_at: string;
  responded_at: string | null;
}

const INBOX_COLUMNS =
  "id, recipient_id, kind, title, body, ref_id, is_read, created_at";
export const REVEAL_COLUMNS =
  "id, server_id, message_id, requester_id, poster_id, status, created_at, responded_at";

export async function listInboxItems(
  supabase: SupabaseClient,
  myAccountId: string,
  limit: number,
): Promise<InboxItemRow[]> {
  const { data } = await supabase
    .from("inbox_items")
    .select(INBOX_COLUMNS)
    .eq("recipient_id", myAccountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as InboxItemRow[];
}

export interface PendingInviteEntry {
  invite: GroupInviteRow;
  server: ServerRow | null;
}

// Direct invites addressed to me for servers I haven't joined yet.
export async function listPendingDirectInvites(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<PendingInviteEntry[]> {
  const { data } = await admin
    .from("group_invites")
    .select(
      "id, server_id, invite_code, created_by, invitee_account_id, expires_at, created_at",
    )
    .eq("invitee_account_id", myAccountId)
    .order("created_at", { ascending: false });
  const invites = (data ?? []) as GroupInviteRow[];
  if (invites.length === 0) return [];

  const nowIso = new Date().toISOString();
  const { data: memberData } = await admin
    .from("server_members")
    .select("server_id")
    .eq("account_id", myAccountId);
  const joined = new Set(
    ((memberData ?? []) as Array<{ server_id: string }>).map((row) => row.server_id),
  );

  const pending = invites.filter(
    (invite) =>
      !joined.has(invite.server_id) &&
      (invite.expires_at === null || invite.expires_at > nowIso),
  );
  if (pending.length === 0) return [];

  const { data: serverData } = await admin
    .from("servers")
    .select(
      "id, name, type, is_main_channel, icon_url, description, created_by, created_at",
    )
    .in(
      "id",
      pending.map((invite) => invite.server_id),
    );
  const serversById = new Map<string, ServerRow>();
  ((serverData ?? []) as ServerRow[]).forEach((server) => {
    serversById.set(server.id, server);
  });
  return pending.map((invite) => ({
    invite,
    server: serversById.get(invite.server_id) ?? null,
  }));
}

export async function getInboxUnreadCount(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<number> {
  const [itemsResult, invites] = await Promise.all([
    admin
      .from("inbox_items")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", myAccountId)
      .eq("is_read", false),
    listPendingDirectInvites(admin, myAccountId),
  ]);
  return (itemsResult.count ?? 0) + invites.length;
}

// Delivers an inbox notice via the service role (inbox_items has no client
// INSERT policy — delivery is a server-action job by schema design).
export async function deliverInboxItem(
  admin: SupabaseClient,
  recipientId: string,
  kind: string,
  title: string,
  body: string | null,
  refId: string | null,
): Promise<void> {
  await admin.from("inbox_items").insert({
    recipient_id: recipientId,
    kind,
    title,
    body,
    ref_id: refId,
  });
}
