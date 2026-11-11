"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { pollsOfTheDay } from "@/lib/daily-polls";

export interface PollState {
  ok: boolean;
  /** Votes per option index (0-filled up to the option count). */
  counts: number[];
  total: number;
  myVote: number | null;
  error?: string;
}

/** Aggregate counts for ONE of today's polls via the security-
 * definer RPC (migration 0015 — totals only, never who voted). */
async function readCountsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  pollIndex: number,
  optionCount: number,
): Promise<number[]> {
  const counts = new Array<number>(optionCount).fill(0);
  const { data } = await supabase.rpc("daily_poll_counts", {
    p_date: date,
  });
  for (const row of (data ?? []) as {
    poll_index: number;
    option_index: number;
    votes: number | string;
  }[]) {
    if (
      row.poll_index === pollIndex &&
      row.option_index >= 0 &&
      row.option_index < optionCount
    ) {
      counts[row.option_index] = Number(row.votes);
    }
  }
  return counts;
}

/**
 * Cast (or change) my vote in one of today's polls. The date, the
 * question set and the option range all come from the server's
 * own polls of the day — nothing about which poll this is is
 * trusted from the client beyond the two indices. Upserts on the
 * (poll_date, poll_index, account_id) PK under own-row RLS, then
 * returns the fresh aggregate state for the result bars.
 */
export async function voteDailyPollAction(
  pollIndex: number,
  optionIndex: number,
): Promise<PollState> {
  const polls = pollsOfTheDay();
  const poll = polls.find((entry) => entry.index === pollIndex);
  const fallback: PollState = {
    ok: false,
    counts: new Array<number>(poll?.options.length ?? 0).fill(0),
    total: 0,
    myVote: null,
  };
  if (!poll) {
    return { ...fallback, error: "That question isn't in today's set." };
  }
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
      poll_index: poll.index,
      account_id: account.id,
      option_index: optionIndex,
    },
    { onConflict: "poll_date,poll_index,account_id" },
  );
  if (error) {
    return { ...fallback, error: "Your vote didn't land — try again." };
  }

  const counts = await readCountsFor(
    supabase,
    poll.date,
    poll.index,
    poll.options.length,
  );
  return {
    ok: true,
    counts,
    total: counts.reduce((sum, n) => sum + n, 0),
    myVote: optionIndex,
  };
}
