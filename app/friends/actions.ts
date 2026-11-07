"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMatchById,
  listMessages,
  otherPartyId,
  type MatchRow,
  type MessageRow,
} from "@/lib/social";

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
    .select("id, match_id, sender_id, body, image_url, read_at, created_at")
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

// Polling fetch for the chat view (no realtime publication in the schema —
// the chat polls this every few seconds; see ChatView).
export async function fetchMessagesAction(matchId: string): Promise<MessageRow[]> {
  const ctx = await requirePollAccount();
  if (!ctx) return [];
  const match = await requireMyMatch(ctx.supabase, matchId, ctx.accountId);
  if (!match) return [];
  return listMessages(ctx.supabase, matchId, 200);
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
