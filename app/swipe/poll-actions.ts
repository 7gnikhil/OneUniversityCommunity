"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { pollOfTheDay } from "@/lib/daily-polls";

export interface PollState {
  ok: boolean;
  /** Votes per option index (0-filled up to the option count). */
  counts: number[];
  total: number;
  myVote: number | null;
  error?: string;
}

/** Aggregate counts for today's poll via the security-definer RPC
 * (migration 0015 — totals only, never who voted what). */
async function readCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  optionCount: number,
): Promise<number[]> {
  const counts = new Array<number>(optionCount).fill(0);
  const { data } = await supabase.rpc("daily_poll_counts", {
    p_date: date,
  });
  for (const row of (data ?? []) as {
    option_index: number;
    votes: number | string;
  }[]) {
    if (row.option_index >= 0 && row.option_index < optionCount) {
      counts[row.option_index] = Number(row.votes);
    }
  }
  return counts;
}

/**
 * Cast (or change) my vote in today's poll. The date and the option
 * range come from the server's own poll of the day — nothing about
 * which poll this is is trusted from the client. Upserts on the
 * (poll_date, account_id) PK under own-row RLS, then returns the
 * fresh aggregate state for the result bars.
 */
export async function voteDailyPollAction(
  optionIndex: number,
): Promise<PollState> {
  const poll = pollOfTheDay();
  const fallback: PollState = {
    ok: false,
    counts: new Array<number>(poll.options.length).fill(0),
    total: 0,
    myVote: null,
  };
  if (
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= poll.options.length
  ) {
    return { ...fallback, error: "That option doesn't exist." };
  }

  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  if (!account) {
    return { ...fallback, error: "Finish setting up your account first." };
  }

  const { error } = await supabase.from("daily_poll_votes").upsert(
    {
      poll_date: poll.date,
      account_id: account.id,
      option_index: optionIndex,
    },
    { onConflict: "poll_date,account_id" },
  );
  if (error) {
    return { ...fallback, error: "Your vote didn't land — try again." };
  }

  const counts = await readCounts(supabase, poll.date, poll.options.length);
  return {
    ok: true,
    counts,
    total: counts.reduce((sum, n) => sum + n, 0),
    myVote: optionIndex,
  };
}
