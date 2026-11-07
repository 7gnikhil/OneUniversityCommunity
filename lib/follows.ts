// Follow-graph data layer. A FOLLOW is an explicit ask (unlike a swipe's
// silent mutual-like): the requester taps Follow on a profile or search
// result, the target answers from their Inbox, and only an ACCEPT makes
// the pair friends — accepting inserts the canonical ordered-pair row
// into public.matches (see app/follow/actions.ts), so every
// matches-driven surface (Friends list, DMs, deck exclusions) treats
// followed-and-accepted pairs exactly like swipe matches.
//
// ALL reads/writes here run on the SERVICE-ROLE client: follow_requests
// has RLS enabled with no policies (migration 0006) — follow state is a
// server-action concern, never a client query.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicProfilesByIds, orderedPair } from "@/lib/social";
import type { PublicProfile } from "@/lib/types";

export type FollowStatus = "pending" | "accepted" | "declined";

export interface FollowRequestRow {
  id: string;
  requester_id: string;
  target_id: string;
  status: FollowStatus;
  created_at: string;
  responded_at: string | null;
}

// Relationship of OTHER to ME, from my point of view:
//   friends     — a matches row exists for the pair (accepted follow or
//                 mutual swipe); this wins over any follow row.
//   accepted    — a follow row says accepted but no match row exists
//                 (shouldn't happen — accept creates the match — but the
//                 state is reported honestly if data ever drifts).
//   pending_out — I asked them; waiting on their answer.
//   pending_in  — they asked me; the answer happens in my Inbox.
//   none        — no relationship (or only an old declined ask).
export type FollowState =
  | "none"
  | "pending_out"
  | "pending_in"
  | "accepted"
  | "friends";

const FOLLOW_COLUMNS =
  "id, requester_id, target_id, status, created_at, responded_at";

export async function areMatched(
  admin: SupabaseClient,
  firstId: string,
  secondId: string,
): Promise<boolean> {
  const pair = orderedPair(firstId, secondId);
  const { data } = await admin
    .from("matches")
    .select("id")
    .eq("account_a", pair.account_a)
    .eq("account_b", pair.account_b)
    .maybeSingle();
  return data !== null && data !== undefined;
}

// The pair's follow row in one direction, if any (UNIQUE pair per
// direction, so at most one row).
export async function getFollowRow(
  admin: SupabaseClient,
  requesterId: string,
  targetId: string,
): Promise<FollowRequestRow | null> {
  const { data } = await admin
    .from("follow_requests")
    .select(FOLLOW_COLUMNS)
    .eq("requester_id", requesterId)
    .eq("target_id", targetId)
    .maybeSingle();
  return (data ?? null) as FollowRequestRow | null;
}

export async function getFollowState(
  admin: SupabaseClient,
  meId: string,
  otherId: string,
): Promise<FollowState> {
  if (await areMatched(admin, meId, otherId)) return "friends";
  const [outgoing, incoming] = await Promise.all([
    getFollowRow(admin, meId, otherId),
    getFollowRow(admin, otherId, meId),
  ]);
  if (outgoing?.status === "accepted" || incoming?.status === "accepted") {
    return "accepted";
  }
  if (outgoing?.status === "pending") return "pending_out";
  if (incoming?.status === "pending") return "pending_in";
  return "none";
}

export interface PendingFollowEntry {
  request: FollowRequestRow;
  requester: PublicProfile | null;
}

// Pending requests addressed to me, newest first, with each requester's
// public profile for the Inbox card (photo/name/@username). A requester
// who lost `verified` status drops out of public_profiles and renders as
// a null profile — the Inbox skips those cards.
export async function listPendingFollowRequests(
  admin: SupabaseClient,
  myAccountId: string,
): Promise<PendingFollowEntry[]> {
  const { data } = await admin
    .from("follow_requests")
    .select(FOLLOW_COLUMNS)
    .eq("target_id", myAccountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as FollowRequestRow[];
  if (requests.length === 0) return [];
  const profiles = await getPublicProfilesByIds(
    admin,
    requests.map((request) => request.requester_id),
  );
  return requests.map((request) => ({
    request,
    requester: profiles.get(request.requester_id) ?? null,
  }));
}

// Creates the pending ask, or revives the pair's existing row (an old
// declined ask past its cooldown, or a stale accepted row with no match)
// back to pending with a fresh created_at. Callers have already checked
// state/cooldown — this helper just writes.
export async function createFollowRequest(
  admin: SupabaseClient,
  requesterId: string,
  targetId: string,
): Promise<FollowRequestRow | null> {
  const nowIso = new Date().toISOString();
  const existing = await getFollowRow(admin, requesterId, targetId);
  if (existing) {
    const { data, error } = await admin
      .from("follow_requests")
      .update({ status: "pending", responded_at: null, created_at: nowIso })
      .eq("id", existing.id)
      .select(FOLLOW_COLUMNS)
      .single();
    if (error) return null;
    return (data ?? null) as FollowRequestRow | null;
  }
  const { data, error } = await admin
    .from("follow_requests")
    .insert({ requester_id: requesterId, target_id: targetId, status: "pending" })
    .select(FOLLOW_COLUMNS)
    .single();
  if (error) return null;
  return (data ?? null) as FollowRequestRow | null;
}

export async function respondToFollowRequest(
  admin: SupabaseClient,
  requestId: string,
  accept: boolean,
): Promise<boolean> {
  const { error } = await admin
    .from("follow_requests")
    .update({
      status: accept ? "accepted" : "declined",
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  return !error;
}
