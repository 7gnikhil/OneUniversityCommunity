"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMatchById,
  listMessages,
  listMessagesSince,
  otherPartyId,
  type MatchRow,
  type MessageRow,
} from "@/lib/social";
import {
  getPresenceMap,
  getPrivacySettings,
  isOnline,
  isTypingAt,
} from "@/lib/presence";

// DM chat actions. Reads/writes that RLS covers (reading a match I'm in,
// sending as myself, marking THEIR messages read) run on the SESSION
// client. Match deletion and block insertion run on the SERVICE-ROLE
// client: matches has no client DELETE policy by design, and a block must
// be recorded even though it also has to hide the blocked person from the
// blocker's own RLS-scoped views afterwards.

export interface SendMessageResult {
  message: MessageRow | null;
  error: string | null;
}

const MAX_BODY_CHARS = 2000;

async function requireAccount(): Promise<
  { accountId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  return { accountId: account.id, supabase };
}

// Polling-path variant of requireAccount: identical resolution, but the
// session is read locally (JWT claims via getSessionUser, getUser
// fallback) instead of paying an Auth-server round trip on every poll.
// Used ONLY by the two actions ChatView invokes from its poll loop —
// fetchMessagesAction and markMatchReadAction. Mutations (send, unmatch,
// block) keep the fully server-validated requireAccount above.
async function requirePollAccount(): Promise<
  { accountId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null
> {
  const supabase = await createClient();
  const sessionUser = await getSessionUser(supabase);
  if (!sessionUser) return null;
  const account = await getAccountByAuthUserId(supabase, sessionUser.id);
  if (!account) return null;
  return { accountId: account.id, supabase };
}

async function requireMyMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  myAccountId: string,
): Promise<MatchRow | null> {
  const match = await getMatchById(supabase, matchId);
  if (!match) return null;
  if (match.account_a !== myAccountId && match.account_b !== myAccountId) {
    return null;
  }
  return match;
}

export async function sendMessageAction(
  matchId: string,
  body: string,
  imageUrl: string | null,
): Promise<SendMessageResult> {
  const ctx = await requireAccount();
  if (!ctx) return { message: null, error: "Please sign in again." };
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return { message: null, error: "That chat isn't available." };

  const text = body.trim().slice(0, MAX_BODY_CHARS);
  if (!text && !imageUrl) {
    return { message: null, error: "Write a message or attach a photo first." };
  }

  const { data, error } = await ctx.supabase
    .from("messages")
    .insert({
      match_id: matchId,
      sender_id: ctx.accountId,
      body: text || null,
      image_url: imageUrl,
    })
    .select("id, match_id, sender_id, body, image_url, delivered_at, read_at, created_at")
    .single();
  if (error || !data) {
    return { message: null, error: "That message didn't send — please try again." };
  }

  // Keep the Friends list ordered by latest activity: matches.updated_at
  // has no client UPDATE policy, so the bump goes through the service
  // role. Best-effort — the message itself is already saved.
  try {
    const admin = createAdminClient();
    await admin
      .from("matches")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", matchId);
  } catch {
    // Ordering nicety only; ignore.
  }

  return { message: data as MessageRow, error: null };
}

// ── DM polling (incremental) ───────────────────────────────────────────────
// No realtime publication in the schema, so the chat polls this every
// few seconds. The poll carries EVERYTHING the chat header and bubbles
// need, so the request count never grows:
//
//   messages — only messages at/after `since` (the newest created_at
//              the client already has); a null since falls back to the
//              full window. The merge happens client-side by id.
//   ticks    — delivered/viewed states for my latest 50 own messages,
//              so ticks advance on messages already on screen without
//              refetching them. VIEWED STATE PRIVACY: if the other
//              party turned read receipts OFF, read_at is stripped to
//              null here — I keep marking their messages read exactly
//              as before; they just never see the viewed state.
//   peer*    — the other party's presence for the header: online and
//              typing only surface when their "show my online status"
//              switch is ON; when it's OFF all three come back null /
//              false and the UI shows nothing (not even last seen).
export interface MessageTickState {
  id: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface DmPollResult {
  messages: MessageRow[];
  ticks: MessageTickState[];
  peerOnline: boolean | null;
  peerLastSeen: string | null;
  peerTyping: boolean;
}

const EMPTY_POLL: DmPollResult = {
  messages: [],
  ticks: [],
  peerOnline: null,
  peerLastSeen: null,
  peerTyping: false,
};

export async function fetchMessagesAction(
  matchId: string,
  since?: string | null,
): Promise<DmPollResult> {
  const ctx = await requirePollAccount();
  if (!ctx) return EMPTY_POLL;
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return EMPTY_POLL;
  const peerId: string = otherPartyId(match, ctx.accountId);

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  // Delivery marking rides on this poll: the messages addressed to me
  // in this chat have now reached my client, so their delivered_at is
  // set (batched, undelivered rows only — a repeat poll is a no-op).
  // Service role: delivered_at deliberately has no client UPDATE path.
  if (admin) {
    try {
      await admin
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("match_id", matchId)
        .neq("sender_id", ctx.accountId)
        .is("delivered_at", null);
    } catch {
      // Ticks are best-effort; the messages below matter more.
    }
  }

  const sinceIso =
    typeof since === "string" && since.length > 0 && since.length <= 40
      ? since
      : null;
  const messagesPromise = sinceIso
    ? listMessagesSince(ctx.supabase, matchId, sinceIso, 200)
    : listMessages(ctx.supabase, matchId, 200);

  // Tick states for my own latest messages (session client — I'm a
  // participant, so RLS lets me read the rows; only the shaping below
  // depends on the peer's privacy switch).
  const ticksPromise = (async (): Promise<MessageTickState[]> => {
    const { data } = await ctx.supabase
      .from("messages")
      .select("id, delivered_at, read_at")
      .eq("match_id", matchId)
      .eq("sender_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data ?? []) as MessageTickState[]).map((row) => ({ ...row }));
  })();

  const [messages, ticks, peerPrivacy, presenceById] = await Promise.all([
    messagesPromise,
    ticksPromise,
    admin
      ? getPrivacySettings(admin, peerId)
      : Promise.resolve({ showOnline: true, readReceipts: true }),
    admin
      ? getPresenceMap(admin, [peerId])
      : Promise.resolve(new Map<string, never>()),
  ]);

  // The receiver's read-receipts switch shapes what I, the sender, may
  // see: receipts off → every read_at (ticks AND message rows) reads as
  // null. Their unread badge on my side is computed from read_at too,
  // but that lives in a different query and is unaffected.
  const shapedTicks = peerPrivacy.readReceipts
    ? ticks
    : ticks.map((row) => ({ ...row, read_at: null }));
  const shapedMessages = peerPrivacy.readReceipts
    ? messages
    : messages.map((row) =>
        row.sender_id === ctx.accountId ? { ...row, read_at: null } : row,
      );

  let peerOnline: boolean | null = null;
  let peerLastSeen: string | null = null;
  let peerTyping = false;
  if (peerPrivacy.showOnline) {
    const presence = presenceById.get(peerId) ?? null;
    peerOnline = isOnline(presence);
    peerLastSeen = presence?.last_seen_at ?? null;
    peerTyping = isTypingAt(presence, "dm", matchId);
  }

  return {
    messages: shapedMessages,
    ticks: shapedTicks,
    peerOnline,
    peerLastSeen,
    peerTyping,
  };
}

// Marks every incoming (theirs, not mine) unread message in this match as
// read. The messages_mark_read RLS policy permits exactly this update and
// no other, so the session client is sufficient.
export async function markMatchReadAction(matchId: string): Promise<void> {
  const ctx = await requirePollAccount();
  if (!ctx) return;
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return;
  await ctx.supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .neq("sender_id", ctx.accountId)
    .is("read_at", null);
}

export async function unmatchAction(
  matchId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireAccount();
  if (!ctx) return { error: "Please sign in again." };
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return { error: "That chat isn't available." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Unmatching isn't fully configured yet." };
  }
  // messages.match_id references matches with ON DELETE CASCADE, so the
  // conversation goes with the match.
  const { error } = await admin.from("matches").delete().eq("id", matchId);
  if (error) return { error: "Couldn't unmatch — please try again." };
  return { error: null };
}

export async function blockChatAction(
  matchId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireAccount();
  if (!ctx) return { error: "Please sign in again." };
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return { error: "That chat isn't available." };
  const otherId: string = otherPartyId(match, ctx.accountId);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Blocking isn't fully configured yet." };
  }
  // Record the block first (either-direction blocks hide the pair from
  // deck/search everywhere), then end the match (messages cascade).
  const { error: blockError } = await admin
    .from("blocks")
    .upsert(
      { blocker_id: ctx.accountId, blocked_id: otherId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
  if (blockError) return { error: "Couldn't block — please try again." };
  const { error: matchError } = await admin
    .from("matches")
    .delete()
    .eq("id", matchId);
  if (matchError) return { error: "Blocked, but the chat couldn't be closed — please try again." };
  return { error: null };
}
