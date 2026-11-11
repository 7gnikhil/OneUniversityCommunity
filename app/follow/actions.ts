"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, type AccountRow } from "@/lib/auth/account";
import { deliverInboxItem } from "@/lib/inbox";
import {
  areMatched,
  createFollowRequest,
  getFollowRow,
  respondToFollowRequest,
  type FollowRequestRow,
} from "@/lib/follows";
import { orderedPair } from "@/lib/social";
import { notifyAccount } from "@/lib/push";

// Follow requests. A FOLLOW is an explicit ask from a profile or search
// result (a swipe stays a silent mutual-like). The ask lands in the
// target's Inbox; only an ACCEPT makes the pair friends — accepting
// inserts the canonical ordered-pair matches row exactly like
// recordSwipeAction does, so the Friends list and DM gating (both
// matches-driven) pick the pair up unchanged.
//
// Anti-spam, enforced here server-side (mirrors reveal requests):
//   - one pending ask per (requester, target) pair (UNIQUE + state check);
//   - a declined ask cannot be re-sent for 7 days;
//   - a block in either direction refuses new asks.
// The acting account ALWAYS comes from the session — a client-supplied
// id is only ever the TARGET, never the actor.

const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// The states the FollowButton renders.
export type FollowUiState = "follow" | "requested" | "friends" | "self";

export interface FollowActionResult {
  state: FollowUiState | null;
  error: string | null;
}

interface Ctx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
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
  return { account, admin };
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

// Best-effort: mark the delivered 'follow_request' notice read once the
// target has answered it from the Inbox's actionable section.
async function markFollowNoticeRead(
  admin: Ctx["admin"],
  targetId: string,
  requestId: string,
): Promise<void> {
  try {
    await admin
      .from("inbox_items")
      .update({ is_read: true })
      .eq("recipient_id", targetId)
      .eq("kind", "follow_request")
      .eq("ref_id", requestId);
  } catch {
    // The answer itself already saved; the notice read-state is cosmetic.
  }
}

export async function sendFollowRequestAction(
  targetAccountId: string,
): Promise<FollowActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { state: null, error: "Please sign in again." };
  const me: AccountRow = ctx.account;
  if (targetAccountId === me.id) return { state: "self", error: null };

  // The target must be a real, verified student (same rule as swiping).
  const { data: targetData } = await ctx.admin
    .from("accounts")
    .select("id, status")
    .eq("id", targetAccountId)
    .maybeSingle();
  const target = (targetData ?? null) as { id: string; status: string } | null;
  if (!target || target.status !== "verified") {
    return { state: null, error: "That student isn't available." };
  }

  if (await blockedEitherWay(ctx.admin, me.id, targetAccountId)) {
    return { state: null, error: "You can't follow this person." };
  }

  if (await areMatched(ctx.admin, me.id, targetAccountId)) {
    return { state: "friends", error: null };
  }

  const existing = await getFollowRow(ctx.admin, me.id, targetAccountId);
  if (existing?.status === "pending") return { state: "requested", error: null };
  if (existing?.status === "accepted") {
    // Accepted earlier but the match row is missing — heal it by falling
    // through and re-asking; the target's accept recreates the match.
  }
  if (existing?.status === "declined") {
    const respondedAt: number = existing.responded_at
      ? new Date(existing.responded_at).getTime()
      : new Date(existing.created_at).getTime();
    if (Date.now() - respondedAt < DECLINE_COOLDOWN_MS) {
      return {
        state: null,
        error: "They declined recently — give it a week before asking again.",
      };
    }
  }

  const request = await createFollowRequest(ctx.admin, me.id, targetAccountId);
  if (!request) {
    return { state: null, error: "Couldn't send that request — please try again." };
  }
  await deliverInboxItem(
    ctx.admin,
    targetAccountId,
    "follow_request",
    "New follow request",
    `@${me.username} wants to follow you`,
    request.id,
  );
  // Re-engagement (2026-11-11): the same event as a push, for
  // devices that subscribed (fails soft inside lib/push).
  await notifyAccount(ctx.admin, targetAccountId, {
    title: "New follow request",
    body: `@${me.username} wants to follow you`,
    url: "/inbox",
    tag: "follow-requests",
  });
  return { state: "requested", error: null };
}

export async function respondFollowRequestAction(
  requestId: string,
  accept: boolean,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const me: AccountRow = ctx.account;

  const { data } = await ctx.admin
    .from("follow_requests")
    .select("id, requester_id, target_id, status, created_at, responded_at")
    .eq("id", requestId)
    .maybeSingle();
  const request = (data ?? null) as FollowRequestRow | null;
  if (!request || request.target_id !== me.id) {
    return { error: "That request isn't yours to answer." };
  }
  if (request.status !== "pending") {
    return { error: "You've already answered this one." };
  }
  const requesterId: string = request.requester_id;

  if (await blockedEitherWay(ctx.admin, requesterId, me.id)) {
    await respondToFollowRequest(ctx.admin, requestId, false);
    await markFollowNoticeRead(ctx.admin, me.id, requestId);
    return { error: "That request was cancelled." };
  }

  const saved = await respondToFollowRequest(ctx.admin, requestId, accept);
  if (!saved) return { error: "Couldn't save your answer — please try again." };

  if (accept) {
    // Friends now: the canonical ordered-pair match, created exactly as
    // a mutual swipe creates it (UNIQUE pair + ignoreDuplicates).
    const pair = orderedPair(me.id, requesterId);
    await ctx.admin
      .from("matches")
      .upsert(
        { account_a: pair.account_a, account_b: pair.account_b },
        { onConflict: "account_a,account_b", ignoreDuplicates: true },
      );
    await deliverInboxItem(
      ctx.admin,
      requesterId,
      "follow_accepted",
      "Follow request accepted",
      `@${me.username} accepted — you are friends now. Say hello!`,
      requestId,
    );
    await notifyAccount(ctx.admin, requesterId, {
      title: "Follow request accepted",
      body: `@${me.username} accepted — you are friends now. Say hello!`,
      url: "/friends",
      tag: "follow-accepted",
    });
  } else {
    await deliverInboxItem(
      ctx.admin,
      requesterId,
      "follow_declined",
      "Follow request update",
      `Your follow request to @${me.username} was declined.`,
      requestId,
    );
  }
  await markFollowNoticeRead(ctx.admin, me.id, requestId);
  return { error: null };
}

export async function cancelFollowRequestAction(
  targetAccountId: string,
): Promise<FollowActionResult> {
  const ctx = await requireCtx();
  if (!ctx) return { state: null, error: "Please sign in again." };
  const { error } = await ctx.admin
    .from("follow_requests")
    .delete()
    .eq("requester_id", ctx.account.id)
    .eq("target_id", targetAccountId)
    .eq("status", "pending");
  if (error) {
    return { state: null, error: "Couldn't cancel that request — please try again." };
  }
  return { state: "follow", error: null };
}
