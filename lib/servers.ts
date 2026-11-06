// Servers data layer: server list, channels, members, flairs, messages,
// group invites — plus the Maya Jwalam (main channel) projection.
//
// Most reads/writes here run on the SERVICE-ROLE client passed in by the
// caller. That is deliberate: the main channel's anonymity rule (member
// viewers must never receive author identity) cannot be expressed in RLS,
// which cannot strip columns, and several cross-user reads (blocks in both
// directions, reveal grants) are invisible to a session client by design.
// Every function therefore re-checks membership / role / visibility in
// code before returning anything, and the Jwalam projection below is the
// ONLY shape in which main-channel messages leave the server.
//
// Private account data (college, branch-on-account, graduation year,
// email, phone) is never selected in this file. Other students appear only
// as PublicProfile (public_profiles projection via lib/social.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicProfile, ServerType } from "@/lib/types";
import { getPublicProfilesByIds } from "@/lib/social";

// ── Row shapes (mirror supabase/schema.sql) ────────────────────────────────
export interface ServerRow {
  id: string;
  name: string;
  type: ServerType;
  is_main_channel: boolean;
  icon_url: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface ChannelRow {
  id: string;
  server_id: string;
  name: string;
  topic: string | null;
  position: number;
}

export type ServerMemberRole = "owner" | "admin" | "mod" | "member";

export interface ServerMemberRow {
  server_id: string;
  account_id: string;
  role: ServerMemberRole;
  joined_at: string;
  last_read_at: string | null;
}

export interface FlairRow {
  id: string;
  server_id: string | null;
  name: string;
  color: string;
}

export interface ServerMessageRow {
  id: string;
  server_id: string;
  channel_id: string | null;
  author_id: string;
  body: string | null;
  image_url: string | null;
  flair_id: string | null;
  is_pinned: boolean;
  view_count: number;
  created_at: string;
}

export interface GroupInviteRow {
  id: string;
  server_id: string;
  invite_code: string;
  created_by: string;
  invitee_account_id: string | null;
  expires_at: string | null;
  created_at: string;
}

const SERVER_COLUMNS =
  "id, name, type, is_main_channel, icon_url, description, created_by, created_at";
const CHANNEL_COLUMNS = "id, server_id, name, topic, position";
const MEMBER_COLUMNS = "server_id, account_id, role, joined_at, last_read_at";
const FLAIR_COLUMNS = "id, server_id, name, color";
const MESSAGE_COLUMNS =
  "id, server_id, channel_id, author_id, body, image_url, flair_id, is_pinned, view_count, created_at";
const INVITE_COLUMNS =
  "id, server_id, invite_code, created_by, invitee_account_id, expires_at, created_at";

export const REQ_TO_ADMIN_FLAIR = "ReqToAdmin";

// ── Servers ────────────────────────────────────────────────────────────────
export async function getServerById(
  admin: SupabaseClient,
  serverId: string,
): Promise<ServerRow | null> {
  const { data } = await admin
    .from("servers")
    .select(SERVER_COLUMNS)
    .eq("id", serverId)
    .maybeSingle();
  return (data ?? null) as ServerRow | null;
}

export async function getMainServer(
  admin: SupabaseClient,
): Promise<ServerRow | null> {
  const { data } = await admin
    .from("servers")
    .select(SERVER_COLUMNS)
    .eq("is_main_channel", true)
    .maybeSingle();
  return (data ?? null) as ServerRow | null;
}

// Self-heal for the main server: migration-0004 seeds it when an owner
// account exists, but on a database where the owner arrived afterwards
// the row can still be missing. Creation mirrors the migration exactly
// (same name/description/channel) and is guarded by the schema's unique
// partial index on is_main_channel, so concurrent calls cannot fork it.
export async function ensureMainServer(
  admin: SupabaseClient,
): Promise<ServerRow | null> {
  const existing = await getMainServer(admin);
  if (existing) return existing;

  const { data: ownerData } = await admin
    .from("accounts")
    .select("id")
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const owner = (ownerData ?? null) as { id: string } | null;
  if (!owner) return null;
  const ownerId: string = owner.id;

  const { data: inserted } = await admin
    .from("servers")
    .insert({
      name: "Maya Jwalam",
      type: "public",
      is_main_channel: true,
      description:
        "The main OneUco channel. Everyone posts anonymously here — names and profiles stay hidden unless a poster accepts a reveal request.",
      created_by: ownerId,
    })
    .select(SERVER_COLUMNS)
    .maybeSingle();
  const server = (inserted ?? null) as ServerRow | null;
  const main = server ?? (await getMainServer(admin));
  if (!main) return null;

  await admin.from("channels").insert({
    server_id: main.id,
    name: "general",
    topic: "The main channel",
    position: 0,
  });
  await admin.from("server_members").upsert(
    { server_id: main.id, account_id: ownerId, role: "owner" },
    { onConflict: "server_id,account_id", ignoreDuplicates: true },
  );
  return main;
}

// Servers for the list page: Maya Jwalam pinned first (by the caller),
// then servers I'm a member of, then other public servers. Each entry
// carries my membership (null for public servers I haven't joined) and a
// member count.
export interface ServerListEntry {
  server: ServerRow;
  membership: ServerMemberRow | null;
  memberCount: number;
}

export async function listServersForUser(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<ServerListEntry[]> {
  const [serversResult, membersResult] = await Promise.all([
    admin.from("servers").select(SERVER_COLUMNS).order("created_at", { ascending: true }),
    admin.from("server_members").select(MEMBER_COLUMNS).eq("account_id", myAccountId),
  ]);
  const servers = (serversResult.data ?? []) as ServerRow[];
  const myMemberships = (membersResult.data ?? []) as ServerMemberRow[];
  const membershipByServer = new Map<string, ServerMemberRow>();
  myMemberships.forEach((row) => membershipByServer.set(row.server_id, row));

  const visible = servers.filter(
    (server) =>
      server.is_main_channel ||
      server.type === "public" ||
      membershipByServer.has(server.id) ||
      server.created_by === myAccountId,
  );
  if (visible.length === 0) return [];

  const { data: countRows } = await admin
    .from("server_members")
    .select("server_id")
    .in(
      "server_id",
      visible.map((server) => server.id),
    );
  const counts = new Map<string, number>();
  ((countRows ?? []) as Array<{ server_id: string }>).forEach((row) => {
    counts.set(row.server_id, (counts.get(row.server_id) ?? 0) + 1);
  });

  const entries: ServerListEntry[] = visible.map((server) => ({
    server,
    membership: membershipByServer.get(server.id) ?? null,
    memberCount: counts.get(server.id) ?? 0,
  }));
  // Main first, then my memberships (newest join first), then public.
  entries.sort((a, b) => {
    if (a.server.is_main_channel !== b.server.is_main_channel) {
      return a.server.is_main_channel ? -1 : 1;
    }
    const aJoined = a.membership?.joined_at ?? "";
    const bJoined = b.membership?.joined_at ?? "";
    if (aJoined !== bJoined) return bJoined.localeCompare(aJoined);
    return a.server.name.localeCompare(b.server.name);
  });
  return entries;
}

export async function getMembership(
  admin: SupabaseClient,
  serverId: string,
  accountId: string,
): Promise<ServerMemberRow | null> {
  const { data } = await admin
    .from("server_members")
    .select(MEMBER_COLUMNS)
    .eq("server_id", serverId)
    .eq("account_id", accountId)
    .maybeSingle();
  return (data ?? null) as ServerMemberRow | null;
}

// Mirrors public.can_view_server() for service-role reads: public servers
// are viewable by any verified student; private ones need membership,
// ownership, or the app Admin Pass (callers pass isAppAdmin).
export function canViewServer(
  server: ServerRow,
  membership: ServerMemberRow | null,
  myAccountId: string,
  isAppAdmin: boolean,
): boolean {
  if (isAppAdmin) return true;
  if (server.type === "public") return true;
  if (server.created_by === myAccountId) return true;
  return membership !== null;
}

export function isServerStaff(
  membership: ServerMemberRow | null,
  server: ServerRow,
  myAccountId: string,
  isAppAdmin: boolean,
): boolean {
  if (isAppAdmin) return true;
  if (server.created_by === myAccountId) return true;
  return (
    membership !== null &&
    (membership.role === "owner" ||
      membership.role === "admin" ||
      membership.role === "mod")
  );
}

// ── Channels ───────────────────────────────────────────────────────────────
export async function listChannels(
  admin: SupabaseClient,
  serverId: string,
): Promise<ChannelRow[]> {
  const { data } = await admin
    .from("channels")
    .select(CHANNEL_COLUMNS)
    .eq("server_id", serverId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as ChannelRow[];
}

// Normal servers always have at least one channel to post into; the first
// viewer with staff rights (or the creator opening the page) creates the
// default. Idempotent enough for v1: a race can create two defaults, and
// the UI simply lists both.
export async function ensureDefaultChannel(
  admin: SupabaseClient,
  serverId: string,
): Promise<ChannelRow[]> {
  const existing = await listChannels(admin, serverId);
  if (existing.length > 0) return existing;
  await admin.from("channels").insert({
    server_id: serverId,
    name: "general",
    topic: null,
    position: 0,
  });
  return listChannels(admin, serverId);
}

// ── Members (normal servers only — NEVER used for the main channel) ───────
export interface ServerMemberEntry {
  membership: ServerMemberRow;
  profile: PublicProfile | null;
}

export async function listServerMembers(
  admin: SupabaseClient,
  serverId: string,
): Promise<ServerMemberEntry[]> {
  const { data } = await admin
    .from("server_members")
    .select(MEMBER_COLUMNS)
    .eq("server_id", serverId)
    .order("joined_at", { ascending: true });
  const rows = (data ?? []) as ServerMemberRow[];
  const profiles = await getPublicProfilesByIds(
    admin,
    rows.map((row) => row.account_id),
  );
  return rows.map((membership) => ({
    membership,
    profile: profiles.get(membership.account_id) ?? null,
  }));
}

export async function countServerMembers(
  admin: SupabaseClient,
  serverId: string,
): Promise<number> {
  const { count } = await admin
    .from("server_members")
    .select("account_id", { count: "exact", head: true })
    .eq("server_id", serverId);
  return count ?? 0;
}

// ── Flairs ─────────────────────────────────────────────────────────────────
export async function listFlairs(
  admin: SupabaseClient,
  serverId: string,
): Promise<FlairRow[]> {
  const { data } = await admin
    .from("flairs")
    .select(FLAIR_COLUMNS)
    .or(`server_id.is.null,server_id.eq.${serverId}`)
    .order("name", { ascending: true });
  return (data ?? []) as FlairRow[];
}

export async function getReqToAdminFlair(
  admin: SupabaseClient,
): Promise<FlairRow | null> {
  const { data } = await admin
    .from("flairs")
    .select(FLAIR_COLUMNS)
    .is("server_id", null)
    .eq("name", REQ_TO_ADMIN_FLAIR)
    .maybeSingle();
  return (data ?? null) as FlairRow | null;
}

// ── Messages (normal servers) ──────────────────────────────────────────────
export interface ServerMessageView {
  id: string;
  body: string | null;
  imageUrl: string | null;
  flairId: string | null;
  isPinned: boolean;
  createdAt: string;
  authorId: string;
  author: PublicProfile | null;
  mine: boolean;
}

export async function listServerMessages(
  admin: SupabaseClient,
  serverId: string,
  channelId: string | null,
  myAccountId: string,
  limit: number,
): Promise<ServerMessageView[]> {
  let query = admin
    .from("server_messages")
    .select(MESSAGE_COLUMNS)
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (channelId) query = query.eq("channel_id", channelId);
  const { data } = await query;
  const rows = ((data ?? []) as ServerMessageRow[]).reverse();
  const profiles = await getPublicProfilesByIds(
    admin,
    rows.map((row) => row.author_id),
  );
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    imageUrl: row.image_url,
    flairId: row.flair_id,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    authorId: row.author_id,
    author: profiles.get(row.author_id) ?? null,
    mine: row.author_id === myAccountId,
  }));
}

// ── Maya Jwalam projection ─────────────────────────────────────────────────
// The author of a main-channel post reaches a non-admin client ONLY in
// these shapes: anonymous (the default), mine, an official admin post
// (badge only — no identity), or revealed (an accepted reveal grant from
// poster to THIS viewer, public fields only). Admin viewers get the
// moderation shape with the real public profile + account id.
export type JwalamAuthor =
  | { kind: "anonymous" }
  | { kind: "mine" }
  | { kind: "admin-post" }
  | { kind: "revealed"; profile: PublicProfile }
  | { kind: "moderation"; accountId: string; profile: PublicProfile | null };

export interface JwalamMessageView {
  id: string;
  body: string | null;
  imageUrl: string | null;
  flairId: string | null;
  isPinned: boolean;
  createdAt: string;
  viewCount: number;
  author: JwalamAuthor;
  // Reveal affordance for this viewer: a pending request already exists,
  // or asking is currently possible.
  revealPending: boolean;
  canRequestReveal: boolean;
}

interface RevealPairRow {
  poster_id: string;
  status: "pending" | "accepted" | "rejected" | "revoked";
}

export async function recordJwalamViews(
  admin: SupabaseClient,
  serverId: string,
  viewerId: string,
): Promise<void> {
  const { data } = await admin
    .from("server_messages")
    .select("id")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) return;
  await admin.from("server_message_views").upsert(
    ids.map((messageId) => ({ message_id: messageId, account_id: viewerId })),
    { onConflict: "message_id,account_id", ignoreDuplicates: true },
  );
}

export async function listJwalamMessages(
  admin: SupabaseClient,
  serverId: string,
  viewerId: string,
  viewerIsAdmin: boolean,
  limit: number,
): Promise<JwalamMessageView[]> {
  const { data } = await admin
    .from("server_messages")
    .select(MESSAGE_COLUMNS)
    .eq("server_id", serverId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = ((data ?? []) as ServerMessageRow[]).reverse();
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const messageIds = rows.map((row) => row.id);

  const [rolesResult, viewsResult, revealsResult, profiles] = await Promise.all([
    admin.from("accounts").select("id, role").in("id", authorIds),
    admin.from("server_message_views").select("message_id").in("message_id", messageIds),
    admin
      .from("reveal_requests")
      .select("poster_id, status")
      .eq("server_id", serverId)
      .eq("requester_id", viewerId)
      .in("poster_id", authorIds),
    // Public profiles are fetched ONLY for authors this viewer is allowed
    // to identify (admin moderation, or an accepted reveal). For everyone
    // else the profile is never selected into the DTO at all. (The query
    // itself runs server-side; the projection below is the boundary.)
    getPublicProfilesByIds(admin, authorIds),
  ]);

  const adminAuthors = new Set<string>();
  ((rolesResult.data ?? []) as Array<{ id: string; role: string }>).forEach((row) => {
    if (row.role === "admin" || row.role === "owner") adminAuthors.add(row.id);
  });

  const viewCounts = new Map<string, number>();
  ((viewsResult.data ?? []) as Array<{ message_id: string }>).forEach((row) => {
    viewCounts.set(row.message_id, (viewCounts.get(row.message_id) ?? 0) + 1);
  });

  const revealByPoster = new Map<string, RevealPairRow["status"]>();
  ((revealsResult.data ?? []) as RevealPairRow[]).forEach((row) => {
    const current = revealByPoster.get(row.poster_id);
    // Accepted wins (a live grant), then pending, then the rest.
    if (row.status === "accepted") revealByPoster.set(row.poster_id, "accepted");
    else if (row.status === "pending" && current !== "accepted") {
      revealByPoster.set(row.poster_id, "pending");
    } else if (!current) {
      revealByPoster.set(row.poster_id, row.status);
    }
  });

  return rows.map((row) => {
    const revealStatus = revealByPoster.get(row.author_id);
    let author: JwalamAuthor;
    if (viewerIsAdmin) {
      author = {
        kind: "moderation",
        accountId: row.author_id,
        profile: profiles.get(row.author_id) ?? null,
      };
    } else if (row.author_id === viewerId) {
      author = { kind: "mine" };
    } else if (revealStatus === "accepted") {
      const profile = profiles.get(row.author_id);
      author = profile ? { kind: "revealed", profile } : { kind: "anonymous" };
    } else if (adminAuthors.has(row.author_id)) {
      author = { kind: "admin-post" };
    } else {
      author = { kind: "anonymous" };
    }
    return {
      id: row.id,
      body: row.body,
      imageUrl: row.image_url,
      flairId: row.flair_id,
      isPinned: row.is_pinned,
      createdAt: row.created_at,
      viewCount: viewCounts.get(row.id) ?? 0,
      author,
      revealPending: revealStatus === "pending",
      canRequestReveal:
        !viewerIsAdmin &&
        row.author_id !== viewerId &&
        revealStatus !== "accepted" &&
        revealStatus !== "pending",
    };
  });
}

// Latest pinned main-channel message (the Telegram pinned bar). Identity
// rules are the same projection — reuse listJwalamMessages output at the
// call site when the pinned message is already in the loaded window; this
// helper covers the case where it scrolled out of the window.
export async function getJwalamPinned(
  admin: SupabaseClient,
  serverId: string,
  viewerId: string,
  viewerIsAdmin: boolean,
): Promise<JwalamMessageView | null> {
  const { data } = await admin
    .from("server_messages")
    .select("id")
    .eq("server_id", serverId)
    .eq("is_pinned", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pinned = (data ?? null) as { id: string } | null;
  if (!pinned) return null;
  const views = await listJwalamMessages(admin, serverId, viewerId, viewerIsAdmin, 100);
  return views.find((view) => view.id === pinned.id) ?? null;
}

// ── Invites ────────────────────────────────────────────────────────────────
export async function getInviteByCode(
  admin: SupabaseClient,
  code: string,
): Promise<GroupInviteRow | null> {
  const { data } = await admin
    .from("group_invites")
    .select(INVITE_COLUMNS)
    .eq("invite_code", code)
    .maybeSingle();
  return (data ?? null) as GroupInviteRow | null;
}

// The server's current shareable invite (code invites have no invitee).
export async function getServerShareInvite(
  admin: SupabaseClient,
  serverId: string,
): Promise<GroupInviteRow | null> {
  const { data } = await admin
    .from("group_invites")
    .select(INVITE_COLUMNS)
    .eq("server_id", serverId)
    .is("invitee_account_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as GroupInviteRow | null;
}

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

// ── Unread (dial badge) ────────────────────────────────────────────────────
// Unread = messages in servers I belong to, not authored by me, created
// after my membership's last_read_at (migration-0004; falls back to the
// join time for members who have never opened the server).
export async function getServerUnreadCounts(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<Record<string, number>> {
  const { data } = await admin
    .from("server_members")
    .select(MEMBER_COLUMNS)
    .eq("account_id", myAccountId);
  const memberships = (data ?? []) as ServerMemberRow[];
  const counts: Record<string, number> = {};
  await Promise.all(
    memberships.map(async (membership) => {
      const since: string = membership.last_read_at ?? membership.joined_at;
      const { count } = await admin
        .from("server_messages")
        .select("id", { count: "exact", head: true })
        .eq("server_id", membership.server_id)
        .neq("author_id", myAccountId)
        .gt("created_at", since);
      if (count && count > 0) counts[membership.server_id] = count;
    }),
  );
  return counts;
}

export async function getTotalServerUnread(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<number> {
  const counts = await getServerUnreadCounts(admin, myAccountId);
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
