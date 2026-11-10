"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import {
  canViewServer,
  ensureDefaultChannel,
  generateInviteCode,
  getMembership,
  getServerById,
  isServerStaff,
  listJwalamMessages,
  listServerMessages,
  recordJwalamViews,
  REQ_TO_ADMIN_FLAIR as REQ_TO_ADMIN_FLAIR_NAME,
  type JwalamMessageView,
  type ServerMessageView,
  type ServerRow,
} from "@/lib/servers";
import { deliverInboxItem } from "@/lib/inbox";
import {
  getPresenceMap,
  getPrivacyMap,
  isTypingAt,
} from "@/lib/presence";
import { DEVELOPER_DISPLAY_NAME, getPublicProfilesByIds } from "@/lib/social";
import { getDeveloperAccountId } from "@/lib/server/owner";

// Server actions. All data work runs on the service-role client AFTER
// explicit membership/role checks here — several of these operations
// (private joins, flair assignment, editing as an admin) intentionally
// have no direct RLS path, and the main channel's anonymity projection
// must never be bypassed by a client-shaped query.

export interface ActionResult {
  error: string | null;
}

interface Ctx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
  isAppAdmin: boolean;
}

async function requireCtx(): Promise<Ctx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  return {
    account,
    admin,
    isAppAdmin: passesAdminGate(user.email, account),
  };
}

// Polling-path variant of requireCtx: identical resolution, but the
// session is read locally (JWT claims via getSessionUser, getUser
// fallback) instead of paying an Auth-server round trip on every poll.
// Used ONLY by the actions the chat views invoke from their poll loops —
// fetchServerMessagesAction, fetchJwalamMessagesAction and
// markServerReadAction. Every mutation keeps requireCtx above.
async function requirePollCtx(): Promise<Ctx | null> {
  const supabase = await createClient();
  const sessionUser = await getSessionUser(supabase);
  if (!sessionUser) return null;
  const account = await getAccountByAuthUserId(supabase, sessionUser.id);
  if (!account) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  return {
    account,
    admin,
    isAppAdmin: passesAdminGate(sessionUser.email, account),
  };
}

const MAX_BODY_CHARS = 2000;

// ── Create / join ──────────────────────────────────────────────────────────
export interface CreateServerInput {
  name: string;
  type: "public" | "friends_private" | "strangers_private";
  description: string;
  iconUrl: string | null;
}

export async function createServerAction(
  input: CreateServerInput,
): Promise<{ error: string | null; serverId: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", serverId: null };
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "Give your server a name.", serverId: null };
  if (
    input.type !== "public" &&
    input.type !== "friends_private" &&
    input.type !== "strangers_private"
  ) {
    return { error: "Pick who the server is for.", serverId: null };
  }

  const { data, error } = await ctx.admin
    .from("servers")
    .insert({
      name,
      type: input.type,
      description: input.description.trim().slice(0, 300) || null,
      icon_url: input.iconUrl,
      created_by: ctx.account.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Couldn't create the server — please try again.", serverId: null };
  }
  const serverId: string = (data as { id: string }).id;
  // The owner's membership row and the default channel are independent
  // inserts (both keyed only by the new server id) — run them together.
  await Promise.all([
    ctx.admin.from("server_members").insert({
      server_id: serverId,
      account_id: ctx.account.id,
      role: "owner",
    }),
    ctx.admin.from("channels").insert({
      server_id: serverId,
      name: "general",
      topic: null,
      position: 0,
    }),
  ]);
  return { error: null, serverId };
}

export async function joinServerAction(serverId: string): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  // The server row and my membership are independent reads keyed by
  // the same server id — fetch them together.
  const [server, existing] = await Promise.all([
    getServerById(ctx.admin, serverId),
    getMembership(ctx.admin, serverId, ctx.account.id),
  ]);
  if (!server) return { error: "That server doesn't exist." };
  if (existing) return { error: null };
  // Public servers (incl. Maya Jwalam) are joinable directly; private
  // servers join via invite code/link/direct add only.
  if (server.type !== "public" && !ctx.isAppAdmin) {
    return { error: "This server is private — you need an invite." };
  }
  const { error } = await ctx.admin.from("server_members").insert({
    server_id: serverId,
    account_id: ctx.account.id,
    role: "member",
  });
  if (error) return { error: "Couldn't join — please try again." };
  return { error: null };
}

export async function joinByInviteCodeAction(
  code: string,
): Promise<{ error: string | null; serverId: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", serverId: null };
  const { data } = await ctx.admin
    .from("group_invites")
    .select("server_id, invitee_account_id, expires_at")
    .eq("invite_code", code.trim().toUpperCase())
    .maybeSingle();
  const invite = (data ?? null) as {
    server_id: string;
    invitee_account_id: string | null;
    expires_at: string | null;
  } | null;
  if (!invite) return { error: "That invite code doesn't look right.", serverId: null };
  if (invite.expires_at && invite.expires_at < new Date().toISOString()) {
    return { error: "That invite has expired — ask for a fresh one.", serverId: null };
  }
  if (invite.invitee_account_id && invite.invitee_account_id !== ctx.account.id) {
    return { error: "That invite was made for someone else.", serverId: null };
  }
  const existing = await getMembership(ctx.admin, invite.server_id, ctx.account.id);
  if (!existing) {
    const { error } = await ctx.admin.from("server_members").insert({
      server_id: invite.server_id,
      account_id: ctx.account.id,
      role: "member",
    });
    if (error) return { error: "Couldn't join — please try again.", serverId: null };
  }
  return { error: null, serverId: invite.server_id };
}

// ── Messages ───────────────────────────────────────────────────────────────
export interface SendServerMessageResult {
  error: string | null;
  messageId: string | null;
}

export async function sendServerMessageAction(
  serverId: string,
  channelId: string | null,
  body: string,
  imageUrl: string | null,
): Promise<SendServerMessageResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", messageId: null };
  // The server row and my membership are independent reads keyed by
  // the same server id — fetch them together.
  const [server, fetchedMembership] = await Promise.all([
    getServerById(ctx.admin, serverId),
    getMembership(ctx.admin, serverId, ctx.account.id),
  ]);
  if (!server) return { error: "That server doesn't exist.", messageId: null };

  let membership = fetchedMembership;
  if (!membership) {
    // Public servers auto-join on first post (matches the join button's
    // one-tap model); private servers never auto-join.
    if (server.type !== "public" && !ctx.isAppAdmin) {
      return { error: "Join this server before posting.", messageId: null };
    }
    const { error: joinError } = await ctx.admin.from("server_members").insert({
      server_id: serverId,
      account_id: ctx.account.id,
      role: "member",
    });
    if (joinError) return { error: "Couldn't join — please try again.", messageId: null };
    membership = await getMembership(ctx.admin, serverId, ctx.account.id);
    if (!membership) return { error: "Couldn't join — please try again.", messageId: null };
  }

  const text = body.trim().slice(0, MAX_BODY_CHARS);
  if (!text && !imageUrl) {
    return { error: "Write a message or attach a photo first.", messageId: null };
  }

  let resolvedChannelId: string | null = channelId;
  if (!server.is_main_channel) {
    if (!resolvedChannelId) {
      const channels = await ensureDefaultChannel(ctx.admin, serverId);
      resolvedChannelId = channels[0]?.id ?? null;
    }
  } else {
    // The Telegram view is a single stream; keep posts on the first
    // channel so channel-scoped queries elsewhere stay consistent.
    const channels = await ensureDefaultChannel(ctx.admin, serverId);
    resolvedChannelId = channels[0]?.id ?? null;
  }

  const { data, error } = await ctx.admin
    .from("server_messages")
    .insert({
      server_id: serverId,
      channel_id: resolvedChannelId,
      author_id: ctx.account.id,
      body: text || null,
      image_url: imageUrl,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "That message didn't send — please try again.", messageId: null };
  }
  return { error: null, messageId: (data as { id: string }).id };
}

export async function editServerMessageAction(
  messageId: string,
  body: string,
): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("server_messages")
    .select("id, server_id, author_id")
    .eq("id", messageId)
    .maybeSingle();
  const message = (data ?? null) as {
    id: string;
    server_id: string;
    author_id: string;
  } | null;
  if (!message) return { error: "That message is gone." };
  // Own messages always; app admins may edit any message (moderation).
  if (message.author_id !== ctx.account.id && !ctx.isAppAdmin) {
    return { error: "You can only edit your own messages." };
  }
  const text = body.trim().slice(0, MAX_BODY_CHARS);
  if (!text) return { error: "A message can't be empty — delete it instead." };
  const { error } = await ctx.admin
    .from("server_messages")
    .update({ body: text })
    .eq("id", messageId);
  if (error) return { error: "Couldn't save that edit — please try again." };
  return { error: null };
}

export async function deleteServerMessageAction(
  messageId: string,
): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("server_messages")
    .select("id, server_id, author_id")
    .eq("id", messageId)
    .maybeSingle();
  const message = (data ?? null) as {
    id: string;
    server_id: string;
    author_id: string;
  } | null;
  if (!message) return { error: "That message is already gone." };
  if (message.author_id !== ctx.account.id && !ctx.isAppAdmin) {
    // Independent reads keyed by the message's server id — together.
    const [server, membership] = await Promise.all([
      getServerById(ctx.admin, message.server_id),
      getMembership(ctx.admin, message.server_id, ctx.account.id),
    ]);
    const staff =
      server !== null &&
      isServerStaff(membership, server, ctx.account.id, ctx.isAppAdmin) &&
      membership !== null &&
      membership.role === "owner";
    if (!staff) return { error: "You can't delete that message." };
  }
  const { error } = await ctx.admin
    .from("server_messages")
    .delete()
    .eq("id", messageId);
  if (error) return { error: "Couldn't delete — please try again." };
  return { error: null };
}

// Flair assignment is staff-only (server owner/admin/mod or app admin) —
// members can view and filter flairs but never assign them. ONE exception,
// by design: a message's own author may flag their own message with the
// built-in global ReqToAdmin flair — that flag IS the "ask an admin"
// mechanism whose queue lives in /admin/requests.
export async function setMessageFlairAction(
  messageId: string,
  flairId: string | null,
): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("server_messages")
    .select("id, server_id, author_id")
    .eq("id", messageId)
    .maybeSingle();
  const message = (data ?? null) as {
    id: string;
    server_id: string;
    author_id: string;
  } | null;
  if (!message) return { error: "That message is gone." };
  const server = await getServerById(ctx.admin, message.server_id);
  if (!server) return { error: "That server doesn't exist." };

  let flair: { id: string; server_id: string | null; name: string } | null = null;
  if (flairId) {
    const { data: flairData } = await ctx.admin
      .from("flairs")
      .select("id, server_id, name")
      .eq("id", flairId)
      .maybeSingle();
    flair = (flairData ?? null) as {
      id: string;
      server_id: string | null;
      name: string;
    } | null;
    if (!flair || (flair.server_id !== null && flair.server_id !== message.server_id)) {
      return { error: "That flair doesn't belong to this server." };
    }
  }

  const membership = await getMembership(ctx.admin, message.server_id, ctx.account.id);
  const staff = isServerStaff(membership, server, ctx.account.id, ctx.isAppAdmin);
  const authorFlagging =
    flair !== null &&
    flair.server_id === null &&
    flair.name === REQ_TO_ADMIN_FLAIR_NAME &&
    message.author_id === ctx.account.id;
  if (!staff && !authorFlagging) {
    return { error: "Only mods and admins can set flairs." };
  }
  const { error } = await ctx.admin
    .from("server_messages")
    .update({ flair_id: flairId })
    .eq("id", messageId);
  if (error) return { error: "Couldn't set the flair — please try again." };
  return { error: null };
}

export async function togglePinMessageAction(
  messageId: string,
): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("server_messages")
    .select("id, server_id, is_pinned")
    .eq("id", messageId)
    .maybeSingle();
  const message = (data ?? null) as {
    id: string;
    server_id: string;
    is_pinned: boolean;
  } | null;
  if (!message) return { error: "That message is gone." };
  // Independent reads keyed by the message's server id — together.
  const [server, membership] = await Promise.all([
    getServerById(ctx.admin, message.server_id),
    getMembership(ctx.admin, message.server_id, ctx.account.id),
  ]);
  if (!server) return { error: "That server doesn't exist." };
  // Main channel: app admins pin (official pins). Other servers: staff.
  const allowed = server.is_main_channel
    ? ctx.isAppAdmin
    : isServerStaff(membership, server, ctx.account.id, ctx.isAppAdmin);
  if (!allowed) return { error: "You can't pin messages here." };
  const { error } = await ctx.admin
    .from("server_messages")
    .update({ is_pinned: !message.is_pinned })
    .eq("id", messageId);
  if (error) return { error: "Couldn't update the pin — please try again." };
  return { error: null };
}

// ── Polling fetches (DTOs only — the Jwalam one is identity-stripped) ─────
export interface ServerPollResult {
  messages: ServerMessageView[];
  // Display names of members typing in this channel right now (self
  // excluded). Typing follows the same privacy as online status: a
  // member who hid theirs never appears here.
  typingNames: string[];
}

export async function fetchServerMessagesAction(
  serverId: string,
  channelId: string | null,
): Promise<ServerPollResult> {
  const empty: ServerPollResult = { messages: [], typingNames: [] };
  const ctx = await requirePollCtx();
  if (!ctx) return empty;
  // This is the chat polling path: the server row and my membership are
  // independent reads keyed by the same server id — fetch them together.
  const [server, membership] = await Promise.all([
    getServerById(ctx.admin, serverId),
    getMembership(ctx.admin, serverId, ctx.account.id),
  ]);
  if (!server || server.is_main_channel) return empty;
  if (!canViewServer(server, membership, ctx.account.id, ctx.isAppAdmin)) return empty;

  const messagesPromise = listServerMessages(
    ctx.admin,
    serverId,
    channelId,
    ctx.account.id,
    100,
  );

  // Typing names ride on the same poll — no extra requests. The
  // presence scan is scoped to this server's members so a typing row
  // planted anywhere else can't leak in.
  const typingNamesPromise = (async (): Promise<string[]> => {
    if (!channelId) return [];
    try {
      const { data } = await ctx.admin
        .from("server_members")
        .select("account_id")
        .eq("server_id", serverId);
      const memberIds = (
        (data ?? []) as Array<{ account_id: string }>
      ).map((row) => row.account_id);
      if (memberIds.length === 0) return [];
      const [presenceById, privacyById] = await Promise.all([
        getPresenceMap(ctx.admin, memberIds),
        getPrivacyMap(ctx.admin, memberIds),
      ]);
      const typingIds = memberIds.filter(
        (id) =>
          id !== ctx.account.id &&
          privacyById.get(id)?.showOnline !== false &&
          isTypingAt(presenceById.get(id), "server", channelId),
      );
      if (typingIds.length === 0) return [];
      const [profiles, developerId] = await Promise.all([
        getPublicProfilesByIds(ctx.admin, typingIds),
        getDeveloperAccountId(ctx.admin),
      ]);
      return typingIds
        .map((id) => {
          // Developer anonymity: his typing shows only as the neutral
          // developer name, never his real name or @handle.
          if (developerId && id === developerId) return DEVELOPER_DISPLAY_NAME;
          const profile = profiles.get(id);
          if (!profile) return null;
          return profile.name.trim() ? profile.name : `@${profile.username}`;
        })
        .filter((name): name is string => name !== null);
    } catch {
      return [];
    }
  })();

  const [messages, typingNames] = await Promise.all([
    messagesPromise,
    typingNamesPromise,
  ]);
  return { messages, typingNames };
}

export async function fetchJwalamMessagesAction(
  serverId: string,
): Promise<JwalamMessageView[]> {
  const ctx = await requirePollCtx();
  if (!ctx) return [];
  const server = await getServerById(ctx.admin, serverId);
  if (!server || !server.is_main_channel) return [];
  await recordJwalamViews(ctx.admin, serverId, ctx.account.id);
  return listJwalamMessages(ctx.admin, serverId, ctx.account.id, ctx.isAppAdmin, 100);
}

export async function markServerReadAction(serverId: string): Promise<void> {
  const ctx = await requirePollCtx();
  if (!ctx) return;
  await ctx.admin
    .from("server_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("server_id", serverId)
    .eq("account_id", ctx.account.id);
}

// ── Invites: share code, regenerate, direct add ────────────────────────────
async function requireStaff(
  ctx: Ctx,
  serverId: string,
): Promise<{ server: ServerRow } | { error: string }> {
  // Independent reads keyed by the same server id — fetch them together.
  const [server, membership] = await Promise.all([
    getServerById(ctx.admin, serverId),
    getMembership(ctx.admin, serverId, ctx.account.id),
  ]);
  if (!server) return { error: "That server doesn't exist." };
  if (!isServerStaff(membership, server, ctx.account.id, ctx.isAppAdmin)) {
    return { error: "Only the server owner and mods can do that." };
  }
  return { server };
}

export async function regenerateInviteAction(
  serverId: string,
): Promise<{ error: string | null; code: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", code: null };
  const staff = await requireStaff(ctx, serverId);
  if ("error" in staff) return { error: staff.error, code: null };

  // Retire the previous share code so only the fresh one works.
  await ctx.admin
    .from("group_invites")
    .delete()
    .eq("server_id", serverId)
    .is("invitee_account_id", null);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code: string = generateInviteCode();
    const { error } = await ctx.admin.from("group_invites").insert({
      server_id: serverId,
      invite_code: code,
      created_by: ctx.account.id,
      invitee_account_id: null,
    });
    if (!error) return { error: null, code };
  }
  return { error: "Couldn't make a new code — please try again.", code: null };
}

export async function ensureShareInviteAction(
  serverId: string,
): Promise<{ error: string | null; code: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", code: null };
  const staff = await requireStaff(ctx, serverId);
  if ("error" in staff) return { error: staff.error, code: null };
  const { data } = await ctx.admin
    .from("group_invites")
    .select("invite_code")
    .eq("server_id", serverId)
    .is("invitee_account_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = (data ?? null) as { invite_code: string } | null;
  if (existing) return { error: null, code: existing.invite_code };
  return regenerateInviteAction(serverId);
}

// Direct-add: staff add one of THEIR matches straight into the server and
// the added student gets an Inbox notice. (If they're already a member
// this is a friendly no-op.)
export async function directAddMemberAction(
  serverId: string,
  targetAccountId: string,
): Promise<ActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const staff = await requireStaff(ctx, serverId);
  if ("error" in staff) return { error: staff.error };
  const server: ServerRow = staff.server;

  // Only people I'm matched with can be direct-added (the "add friends
  // from inside the group" rule) — app admins excepted.
  if (!ctx.isAppAdmin) {
    const { data } = await ctx.admin
      .from("matches")
      .select("id")
      .or(
        `and(account_a.eq.${ctx.account.id},account_b.eq.${targetAccountId}),and(account_a.eq.${targetAccountId},account_b.eq.${ctx.account.id})`,
      )
      .maybeSingle();
    if (!data) return { error: "You can only add people you're matched with." };
  }

  const existing = await getMembership(ctx.admin, serverId, targetAccountId);
  if (existing) return { error: "They're already in this server." };

  const { error } = await ctx.admin.from("server_members").insert({
    server_id: serverId,
    account_id: targetAccountId,
    role: "member",
  });
  if (error) return { error: "Couldn't add them — please try again." };

  // The invite record and the Inbox notice are independent writes —
  // send them together.
  await Promise.all([
    ctx.admin.from("group_invites").insert({
      server_id: serverId,
      invite_code: generateInviteCode(),
      created_by: ctx.account.id,
      invitee_account_id: targetAccountId,
    }),
    deliverInboxItem(
      ctx.admin,
      targetAccountId,
      "group_invite",
      `You've been added to ${server.name}`,
      "Open Servers to jump in.",
      serverId,
    ),
  ]);
  return { error: null };
}
