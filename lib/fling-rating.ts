// The Fling rating — DERIVED from likes received (owner's design
// rule, 2026-11-11: "the rating is based on likes received — the
// more right swipes a user gets, the higher their rating"). There
// is no manual vote and no ratings table: the score is computed
// live from the swipes table wherever it is shown (deck card,
// Fling profile page, and the owner's own Profile page).
//
// Formula (deliberately simple and explainable): with L likes out
// of T total swipes received, score = (L + 3) / (T + 6) — a
// smoothed approval ratio that starts everyone near the middle
// and only trusts the ratio as swipes accumulate — mapped onto
// 1–10 as rating = 1 + 9 × score, one decimal. Every additional
// like raises it; every pass lowers it. Nobody is rated until at
// least one person has swiped on them.

export interface FlingRating {
  /** 1.0–10.0, one decimal. */
  rating: number;
  likes: number;
  total: number;
}

export function flingRating(likes: number, total: number): FlingRating | null {
  if (total <= 0 || likes < 0 || likes > total) return null;
  const score = (likes + 3) / (total + 6);
  const rating = Math.round((1 + 9 * score) * 10) / 10;
  return { rating, likes, total };
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ratings for a set of accounts, from one grouped read of the
 * swipes table (service-role client — swipes are not publicly
 * readable). Returns a map keyed by account id; accounts with no
 * swipes received are simply absent.
 */
export async function ratingsForAccounts(
  admin: SupabaseClient,
  accountIds: string[],
): Promise<Record<string, FlingRating>> {
  const out: Record<string, FlingRating> = {};
  if (accountIds.length === 0) return out;
  const { data } = await admin
    .from("swipes")
    .select("swipee_id, direction")
    .in("swipee_id", accountIds);
  const tally = new Map<string, { likes: number; total: number }>();
  for (const row of (data ?? []) as {
    swipee_id: string;
    direction: string;
  }[]) {
    const entry = tally.get(row.swipee_id) ?? { likes: 0, total: 0 };
    entry.total += 1;
    if (row.direction === "like") entry.likes += 1;
    tally.set(row.swipee_id, entry);
  }
  for (const [accountId, entry] of tally) {
    const rating = flingRating(entry.likes, entry.total);
    if (rating) out[accountId] = rating;
  }
  return out;
}

/** One account's rating (Fling profile page, own Profile page). */
export async function ratingForAccount(
  admin: SupabaseClient,
  accountId: string,
): Promise<FlingRating | null> {
  const { data } = await admin
    .from("swipes")
    .select("direction")
    .eq("swipee_id", accountId);
  let likes = 0;
  let total = 0;
  for (const row of (data ?? []) as { direction: string }[]) {
    total += 1;
    if (row.direction === "like") likes += 1;
  }
  return flingRating(likes, total);
}
