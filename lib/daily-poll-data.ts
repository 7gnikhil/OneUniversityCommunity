// Server-side read of today's poll state — shared by the Fling
// page and the Chirp hub so the poll of the day is identical (and
// identically voted) in both places. Fail-soft: any error returns
// zero counts and no vote, and the card still renders.

import type { createClient } from "@/lib/supabase/server";
import { pollOfTheDay, type TodaysPoll } from "@/lib/daily-polls";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export interface DailyPollState {
  poll: TodaysPoll;
  counts: number[];
  myVote: number | null;
}

export async function getDailyPollState(
  supabase: SessionClient,
  accountId: string,
): Promise<DailyPollState> {
  const poll = pollOfTheDay();
  let counts = new Array<number>(poll.options.length).fill(0);
  let myVote: number | null = null;
  try {
    const { data: countRows } = await supabase.rpc("daily_poll_counts", {
      p_date: poll.date,
    });
    for (const row of (countRows ?? []) as {
      option_index: number;
      votes: number | string;
    }[]) {
      if (row.option_index >= 0 && row.option_index < poll.options.length) {
        counts[row.option_index] = Number(row.votes);
      }
    }
    const { data: myVoteRow } = await supabase
      .from("daily_poll_votes")
      .select("option_index")
      .eq("poll_date", poll.date)
      .eq("account_id", accountId)
      .maybeSingle();
    myVote = myVoteRow?.option_index ?? null;
  } catch {
    counts = new Array<number>(poll.options.length).fill(0);
    myVote = null;
  }
  return { poll, counts, myVote };
}
