"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { getServerById } from "@/lib/servers";
import { deliverInboxItem, REVEAL_COLUMNS, type RevealRequestRow } from "@/lib/inbox";

// Profile-reveal requests for Maya Jwalam. A member asks an anonymous
// poster "show me your profile"; the request lands in the POSTER's Inbox;
// on Accept the poster's PUBLIC profile becomes visible to that one
// requester (the accepted reveal_requests row IS the grant — the Jwalam
// projection in lib/servers.ts reads it), revocable by the poster at any
// time. On Decline the requester gets the outcome in their Inbox and the
// poster stays anonymous.
//
// Anti-spam, all enforced here server-side:
//   - one pending request per (requester, poster) pair;
//   - a declined pair cannot re-ask for 7 days;
//   - at most 10 requests per requester per day;
//   - a block in either direction refuses new requests and immediately
//     kills any pending ones between the pair (accepted grants are also
//     revoked, since the pair should be invisible to each other).

const DAILY_CAP = 10;
const REJECT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
  return { account, admin, isAppAdmin: passesAdminGate(user.email, account) };
}

async function blockedEitherWay(
  admin: Ctx["admin"],
  first: string,
  second: string,
): Promise<boolean> {
  const { data } = await admin
    .from("blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${first},blocked_id.eq.${second}),and(blocker_id.eq.${second},blocked_id.eq.${first})`,
    )
    .limit(1);
  return (data ?? []).length > 0;
}

// Kills pending requests between a pair and revokes live grants. Called
// whenever a block is observed between the two accounts.
async function killPairRequests(
  admin: Ctx["admin"],
  first: string,
  second: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from("reveal_requests")
    .update({ status: "rejected", responded_at: nowIso })
    .eq("status", "pending")
    .or(
      `and(requester_id.eq.${first},poster_id.eq.${second}),and(requester_id.eq.${second},poster_id.eq.${first})`,
    );
  await admin
    .from("reveal_requests")
    .update({ status: "revoked", responded_at: nowIso })
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${first},poster_id.eq.${second}),and(requester_id.eq.${second},poster_id.eq.${first})`,
    );
}

export async function requestRevealAction(
  messageId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  if (ctx.isAppAdmin) return { error: "Admins already see posters in moderation view." };

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
  if (!message) return { error: "That post is gone." };
  const server = await getServerById(ctx.admin, message.server_id);
  if (!server || !server.is_main_channel) {
    return { error: "Reveals only exist in Maya Jwalam." };
  }
  const posterId: string = message.author_id;
  if (posterId === ctx.account.id) {
    return { error: "That's your own post." };
  }

  if (await blockedEitherWay(ctx.admin, ctx.account.id, posterId)) {
    await killPairRequests(ctx.admin, ctx.account.id, posterId);
    return { error: "You can't ask this person for a reveal." };
  }

  // Pair history: pending / accepted / recent decline.
  const { data: pairData } = await ctx.admin
    .from("reveal_requests")
    .select(REVEAL_COLUMNS)
    .eq("requester_id", ctx.account.id)
    .eq("poster_id", posterId)
    .order("created_at", { ascending: false });
  const pair = (pairData ?? []) as RevealRequestRow[];
  if (pair.some((row) => row.status === "pending")) {
    return { error: "You've already asked — it's in their Inbox." };
  }
  if (pair.some((row) => row.status === "accepted")) {
    return { error: "They've already shared their profile with you." };
  }
  const lastRejected = pair.find((row) => row.status === "rejected");
  if (lastRejected) {
    const respondedAt: number = lastRejected.responded_at
      ? new Date(lastRejected.responded_at).getTime()
      : new Date(lastRejected.created_at).getTime();
    if (Date.now() - respondedAt < REJECT_COOLDOWN_MS) {
      return { error: "They declined recently — give it a week before asking again." };
    }
  }

  // Daily cap across all posters.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { count } = await ctx.admin
    .from("reveal_requests")
    .select("id", { count: "exact", head: true })
    .eq("requester_id", ctx.account.id)
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= DAILY_CAP) {
    return { error: "You've hit today's reveal-request limit — try again tomorrow." };
  }

  const { data: inserted, error } = await ctx.admin
    .from("reveal_requests")
    .insert({
      server_id: message.server_id,
      message_id: message.id,
      requester_id: ctx.account.id,
      poster_id: posterId,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: "Couldn't send that request — please try again." };
  }
  const requestId: string = (inserted as { id: string }).id;
  await deliverInboxItem(
    ctx.admin,
    posterId,
    "reveal_request",
    "Someone asked to see your profile",
    "A Maya Jwalam member asked \"show me your profile\" on one of your anonymous posts. Accepting shows them your public profile; declining keeps you anonymous.",
    requestId,
  );
  return { error: null };
}

export async function respondRevealAction(
  requestId: string,
  accept: boolean,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("reveal_requests")
    .select(REVEAL_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  const request = (data ?? null) as RevealRequestRow | null;
  if (!request || request.poster_id !== ctx.account.id) {
    return { error: "That request isn't yours to answer." };
  }
  if (request.status !== "pending") {
    return { error: "You've already answered this one." };
  }
  if (await blockedEitherWay(ctx.admin, request.requester_id, request.poster_id)) {
    await killPairRequests(ctx.admin, request.requester_id, request.poster_id);
    return { error: "That request was cancelled." };
  }

  const nowIso = new Date().toISOString();
  const { error } = await ctx.admin
    .from("reveal_requests")
    .update({
      status: accept ? "accepted" : "rejected",
      responded_at: nowIso,
    })
    .eq("id", requestId);
  if (error) return { error: "Couldn't save your answer — please try again." };

  await deliverInboxItem(
    ctx.admin,
    request.requester_id,
    "reveal_outcome",
    accept ? "Your reveal request was accepted" : "Your reveal request was declined",
    accept
      ? "The Maya Jwalam poster shared their public profile with you. You'll see who they are on their posts in Maya Jwalam."
      : "The poster chose to stay anonymous. Please don't ask again for a while.",
    requestId,
  );
  return { error: null };
}

export async function revokeRevealAction(
  requestId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const { data } = await ctx.admin
    .from("reveal_requests")
    .select(REVEAL_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  const request = (data ?? null) as RevealRequestRow | null;
  if (!request || request.poster_id !== ctx.account.id) {
    return { error: "That reveal isn't yours to revoke." };
  }
  if (request.status !== "accepted") {
    return { error: "That reveal isn't active anymore." };
  }
  const { error } = await ctx.admin
    .from("reveal_requests")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: "Couldn't revoke — please try again." };
  await deliverInboxItem(
    ctx.admin,
    request.requester_id,
    "reveal_outcome",
    "A shared profile was hidden again",
    "A Maya Jwalam poster you could previously identify has gone back to anonymous.",
    requestId,
  );
  return { error: null };
}
