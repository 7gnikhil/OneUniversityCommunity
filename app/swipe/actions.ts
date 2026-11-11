"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, type AccountRow } from "@/lib/auth/account";
import { orderedPair, type MatchRow } from "@/lib/social";
import { getNotifyDisplayName, notifyAccount } from "@/lib/push";

export interface SwipeResult {
  matched: boolean;
  matchId: string | null;
  error: string | null;
}

const NO_MATCH: SwipeResult = { matched: false, matchId: null, error: null };

// Records one swipe (like or pass) for the signed-in student.
//
// - The swipe row itself is written with the SESSION client: the
//   swipes_insert_own RLS policy scopes it to swiper = me.
// - Reading the OTHER student's like of me, and inserting the match row,
//   go through the SERVICE-ROLE client: swipes are RLS-visible only to
//   their swiper, and matches deliberately has no client INSERT policy
//   (see schema notes) — match creation is a server-side act.
// - Blocks are consulted through the service role too (a block BY the
//   candidate is invisible to my session); a blocked pair can neither
//   swipe nor match.
export async function recordSwipeAction(
  candidateId: string,
  direction: "like" | "pass",
): Promise<SwipeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...NO_MATCH, error: "Please sign in again." };

  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return { ...NO_MATCH, error: "Your account isn't finished yet." };
  const me: AccountRow = account;
  if (candidateId === me.id) return NO_MATCH;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ...NO_MATCH, error: "Swiping isn't fully configured yet — please try again later." };
  }

  // The candidate must be a real, verified student.
  const { data: candidateData } = await admin
    .from("accounts")
    .select("id, status")
    .eq("id", candidateId)
    .maybeSingle();
  const candidate = (candidateData ?? null) as { id: string; status: string } | null;
  if (!candidate || candidate.status !== "verified") return NO_MATCH;

  // Blocks hide both ways — a blocked pair cannot interact at all.
  const { data: blockData } = await admin
    .from("blocks")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${me.id},blocked_id.eq.${candidateId}),and(blocker_id.eq.${candidateId},blocked_id.eq.${me.id})`,
    )
    .limit(1);
  if ((blockData ?? []).length > 0) return NO_MATCH;

  // Record the swipe (unique per pair — a repeat swipe is a no-op).
  const { error: swipeError } = await supabase.from("swipes").insert({
    swiper_id: me.id,
    swipee_id: candidateId,
    direction,
  });
  if (swipeError && !swipeError.message.includes("swipes_swiper_id_swipee_id_key")) {
    return { ...NO_MATCH, error: "That swipe didn't save — please try again." };
  }

  if (direction === "pass") return NO_MATCH;

  // Like: did they already like me? (Their swipe rows are not visible to
  // my session under RLS — service role by design.)
  const { data: theirSwipe } = await admin
    .from("swipes")
    .select("id")
    .eq("swiper_id", candidateId)
    .eq("swipee_id", me.id)
    .eq("direction", "like")
    .maybeSingle();
  if (!theirSwipe) return NO_MATCH;

  // Mutual like -> match. Stored under the canonical ordered pair so the
  // UNIQUE(account_a, account_b) constraint keeps one row per pair.
  const pair = orderedPair(me.id, candidateId);
  await admin
    .from("matches")
    .upsert(
      { account_a: pair.account_a, account_b: pair.account_b },
      { onConflict: "account_a,account_b", ignoreDuplicates: true },
    );
  const { data: matchData } = await admin
    .from("matches")
    .select("id, account_a, account_b, created_at, updated_at")
    .eq("account_a", pair.account_a)
    .eq("account_b", pair.account_b)
    .maybeSingle();
  const match = (matchData ?? null) as MatchRow | null;
  if (!match) return NO_MATCH;

  // Re-engagement (2026-11-11): ping the other student's devices —
  // a match is the app's biggest moment and they may be offline.
  // Awaited, but lib/push fails soft: a push problem must never
  // cost anyone their match.
  const myName = await getNotifyDisplayName(admin, me.id);
  await notifyAccount(admin, candidateId, {
    title: "It's a match",
    body: `${myName} matched with you on Fling — say hello.`,
    url: `/friends/${match.id}`,
    tag: `match-${match.id}`,
  });

  return { matched: true, matchId: match.id, error: null };
}

// "Start again" after the deck is exhausted: forgets ONLY my passes, so
// people I passed on can reappear. Likes are never undone (a like may
// already have created a match, and matches are kept by design).
//
// The 30-second wait lives in the client (SwipeDeck) as a visible
// countdown — it is a UX pause against accidental deck resets, not a
// security boundary (same convention as the login attempt lockout).
export async function resetPassesAction(): Promise<{
  removed: number;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { removed: 0, error: "Please sign in again." };

  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return { removed: 0, error: "Your account isn't finished yet." };
  const myId: string = account.id;

  // swipes has no DELETE policy for the session client, so the reset runs
  // through the service role — scoped strictly to MY pass rows.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { removed: 0, error: "Deck reset isn't fully configured yet." };
  }
  const { data, error } = await admin
    .from("swipes")
    .delete()
    .eq("swiper_id", myId)
    .eq("direction", "pass")
    .select("id");
  if (error) return { removed: 0, error: "Couldn't reset the deck — please try again." };
  return { removed: (data ?? []).length, error: null };
}
