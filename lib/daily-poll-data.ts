// Server-side read of today's poll SET state — shared by the
// Fling page and the Chirp hub so the polls are identical (and
// identically voted) in both places. Fail-soft: any error returns
// zero counts and no votes, and the cards still render.

import type { createClient } from "@/lib/supabase/server";
import { pollsOfTheDay, type TodaysPoll } from "@/lib/daily-polls";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export interface DailyPollEntry {
  poll: TodaysPoll;
  counts: number[];
  myVote: number | null;
}

export async function getDailyPollState(
  supabase: SessionClient,
  accountId: string,
): Promise<DailyPollEntry[]> {
  const polls = pollsOfTheDay();
  const entries: DailyPollEntry[] = polls.map((poll) => ({
    poll,
    counts: new Array<number>(poll.options.length).fill(0),
    myVote: null,
  }));
  try {
    const byIndex = new Map(entries.map((entry) => [entry.poll.index, entry]));
    const { data: countRows } = await supabase.rpc("daily_poll_counts", {
      p_date: polls[0].date,
    });
    for (const row of (countRows ?? []) as {
      poll_index: number;
      option_index: number;
      votes: number | string;
    }[]) {
      const entry = byIndex.get(row.poll_index);
      if (entry && row.option_index >= 0 && row.option_index < entry.counts.length) {
        entry.counts[row.option_index] = Number(row.votes);
      }
    }
    const { data: myVoteRows } = await supabase
      .from("daily_poll_votes")
      .select("poll_index, option_index")
      .eq("poll_date", polls[0].date)
      .eq("account_id", accountId);
    for (const row of myVoteRows ?? []) {
      const entry = byIndex.get(row.poll_index);
      if (entry) entry.myVote = row.option_index;
    }
  } catch {
    // Pre-migration or transient failure: zeros + no votes.
  }
  return entries;
}
