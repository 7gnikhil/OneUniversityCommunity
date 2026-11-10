// Fling profile data layer (migration 0012): the SEPARATE deck-only
// profile — a Fling bio plus free-text likes/dislikes — edited in
// Profile & Settings → Fling data and read on the stranger view opened
// from a deck card (app/swipe/[username]).
//
// This is deliberately NOT part of lib/profile.ts / public.profiles:
// the personal profile mixes deck-visible basics with friends-only
// detail, while fling data has exactly one audience (signed-in
// students in Fling) and one writer (its owner). RLS mirrors that:
// members select any row, owners insert/update only their own.
//
// FAIL-SOFT (codebase doctrine): while migration 0012 hasn't landed,
// every read degrades to the empty fling profile and the surfaces
// render their empty states — nothing throws, nothing breaks.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FlingProfile {
  accountId: string;
  bio: string | null;
  likes: string | null;
  dislikes: string | null;
}

export function emptyFlingProfile(accountId: string): FlingProfile {
  return { accountId, bio: null, likes: null, dislikes: null };
}

interface FlingProfileRow {
  account_id: string;
  bio: string | null;
  likes: string | null;
  dislikes: string | null;
}

const FLING_COLUMNS = "account_id, bio, likes, dislikes";

export async function getFlingProfile(
  supabase: SupabaseClient,
  accountId: string,
): Promise<FlingProfile> {
  try {
    const { data, error } = await supabase
      .from("fling_profiles")
      .select(FLING_COLUMNS)
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) return emptyFlingProfile(accountId);
    const row = data as FlingProfileRow;
    return {
      accountId: row.account_id,
      bio: row.bio,
      likes: row.likes,
      dislikes: row.dislikes,
    };
  } catch {
    return emptyFlingProfile(accountId);
  }
}
