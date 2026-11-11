"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";

export interface RateResult {
  ok: boolean;
  error?: string;
}

/**
 * Rate a Fling profile 1–10 (migration 0016). Independent of
 * swipes: this never likes, passes or matches anyone — it upserts
 * my given rating under own-row RLS. Rating again changes it.
 */
export async function rateProfileAction(
  ratedAccountId: string,
  rating: number,
): Promise<RateResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    return { ok: false, error: "Ratings run from 1 to 10." };
  }
  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  if (!account) {
    return { ok: false, error: "Finish setting up your account first." };
  }
  if (ratedAccountId === account.id) {
    return { ok: false, error: "You can't rate yourself." };
  }
  const { error } = await supabase.from("profile_ratings").upsert(
    {
      rater_account_id: account.id,
      rated_account_id: ratedAccountId,
      rating,
    },
    { onConflict: "rater_account_id,rated_account_id" },
  );
  if (error) {
    return { ok: false, error: "Your rating didn't land — try again." };
  }
  return { ok: true };
}
