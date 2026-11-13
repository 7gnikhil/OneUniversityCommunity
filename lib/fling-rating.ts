// The Fling rating — DERIVED from likes received (owner's design
// rule, 2026-11-11: "the rating is based on likes received — the
// more right swipes a user gets, the higher their rating"; and
// 2026-11-12: the rating in Fling runs PER WEEK). There is no
// manual vote and no ratings table: scores are computed live from
// the swipes table wherever they are shown.
//
// Formula (deliberately simple and explainable): with L likes out
// of T total swipes received in the window, score = (L + 3)/(T + 6)
// — a smoothed approval ratio that starts everyone near the
// middle and only trusts the ratio as swipes accumulate — mapped
// onto 1–10 as rating = 1 + 9 × score, one decimal. Every
// additional like raises it; every pass lowers it. Nobody is
// rated until at least one person has swiped on them.
//
// Windows: "this week" everywhere in Fling means the last 7 days
// (rolling). The owner's Profile page shows the weekly score and
// the all-time one side by side.

import type { SupabaseClient } from "@supabase/supabase-js";

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

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Ratings for a set of accounts, from one grouped read of the
 * swipes table (service-role client — swipes are not publicly
 * readable). `days` limits the window (7 = this week); omit for
 * all-time. Accounts with no swipes in the window are absent.
 */
export async function ratingsForAccounts(
  admin: SupabaseClient,
  accountIds: string[],
  days?: number,
): Promise<Record<string, FlingRating>> {
  const out: Record<string, FlingRating> = {};
  if (accountIds.length === 0) return out;
  let query = admin
    .from("swipes")
    .select("swipee_id, direction")
    .in("swipee_id", accountIds);
  if (days) query = query.gte("created_at", sinceIso(days));
  const { data } = await query;
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
  days?: number,
): Promise<FlingRating | null> {
  let query = admin
    .from("swipes")
    .select("direction")
    .eq("swipee_id", accountId);
  if (days) query = query.gte("created_at", sinceIso(days));
  const { data } = await query;
  let likes = 0;
  let total = 0;
  for (const row of (data ?? []) as { direction: string }[]) {
    total += 1;
    if (row.direction === "like") likes += 1;
  }
  return flingRating(likes, total);
}

export interface WeeklyLeader {
  accountId: string;
  username: string;
  name: string;
  photoUrl: string | null;
  likes: number;
  rating: number;
}

/**
 * "Top this week" for Fling: students ranked by likes received in
 * the last 7 days (ties broken by the weekly rating). The
 * developer account and the no-login seed accounts
 * (*@oneuco.local) are excluded — the board is real students.
 */
export async function weeklyLeaders(
  admin: SupabaseClient,
  limit = 5,
  excludeIds: string[] = [],
): Promise<WeeklyLeader[]> {
  const { data } = await admin
    .from("swipes")
    .select("swipee_id, direction")
    .gte("created_at", sinceIso(7));
  const tally = new Map<string, { likes: number; total: number }>();
  for (const row of (data ?? []) as {
    swipee_id: string;
    direction: string;
  }[]) {
    if (excludeIds.includes(row.swipee_id)) continue;
    const entry = tally.get(row.swipee_id) ?? { likes: 0, total: 0 };
    entry.total += 1;
    if (row.direction === "like") entry.likes += 1;
    tally.set(row.swipee_id, entry);
  }
  const ranked = [...tally.entries()]
    .map(([accountId, entry]) => ({
      accountId,
      likes: entry.likes,
      rating: flingRating(entry.likes, entry.total),
    }))
    .filter((row) => row.likes > 0 && row.rating !== null)
    .sort(
      (a, b) =>
        b.likes - a.likes || (b.rating?.rating ?? 0) - (a.rating?.rating ?? 0),
    )
    .slice(0, limit);
  if (ranked.length === 0) return [];

  const ids = ranked.map((row) => row.accountId);
  const [{ data: profileRows }, { data: accountRows }] = await Promise.all([
    admin
      .from("public_profiles")
      .select("account_id, username, name, photo_url")
      .in("account_id", ids),
    admin.from("accounts").select("id, email").in("id", ids),
  ]);
  const seedIds = new Set(
    (accountRows ?? [])
      .filter((row) => (row.email ?? "").endsWith("@oneuco.local"))
      .map((row) => row.id),
  );
  const profiles = new Map(
    (profileRows ?? []).map((row) => [row.account_id, row]),
  );
  const leaders: WeeklyLeader[] = [];
  for (const row of ranked) {
    if (seedIds.has(row.accountId)) continue;
    const profile = profiles.get(row.accountId);
    if (!profile || !row.rating) continue;
    leaders.push({
      accountId: row.accountId,
      username: profile.username,
      name: profile.name,
      photoUrl: profile.photo_url,
      likes: row.likes,
      rating: row.rating.rating,
    });
  }
  return leaders;
}
