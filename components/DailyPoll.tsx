"use client";

import { useState, useTransition } from "react";
import { voteDailyPollAction } from "@/app/swipe/poll-actions";

// Poll of the day card (Fling, 2026-11-11). Before voting: the
// options are plain tappable rows. After voting — or on arrival
// with a vote already cast — the card flips to result bars with
// percentages; tapping another option changes the vote (the
// server upserts). Counts are aggregates only (daily_poll_counts
// RPC); the card never learns who voted what.

interface DailyPollProps {
  question: string;
  options: string[];
  initialCounts: number[];
  initialMyVote: number | null;
}

export default function DailyPoll({
  question,
  options,
  initialCounts,
  initialMyVote,
}: DailyPollProps) {
  const [counts, setCounts] = useState<number[]>(initialCounts);
  const [myVote, setMyVote] = useState<number | null>(initialMyVote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = counts.reduce((sum, n) => sum + n, 0);
  const showResults = myVote !== null;

  const vote = (optionIndex: number) => {
    if (pending || optionIndex === myVote) return;
    setError(null);
    // Optimistic: move my vote locally, reconcile on the reply.
    const previousVote = myVote;
    const optimistic = [...counts];
    if (previousVote !== null && optimistic[previousVote] > 0) {
      optimistic[previousVote] -= 1;
    }
    optimistic[optionIndex] = (optimistic[optionIndex] ?? 0) + 1;
    setCounts(optimistic);
    setMyVote(optionIndex);
    startTransition(async () => {
      const result = await voteDailyPollAction(optionIndex);
      if (result.ok) {
        setCounts(result.counts);
        setMyVote(result.myVote);
      } else {
        setCounts(counts);
        setMyVote(previousVote);
        setError(result.error ?? "Your vote didn't land — try again.");
      }
    });
  };

  return (
    <section className="w-full max-w-sm self-center rounded-3xl border border-neutral-800 bg-neutral-950 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
        Poll of the day
      </p>
      <p className="mt-1.5 text-sm font-medium text-neutral-100">{question}</p>

      <div className="mt-3 flex flex-col gap-2">
        {options.map((option, i) => {
          const votes = counts[i] ?? 0;
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
          const mine = myVote === i;
          if (!showResults) {
            return (
              <button
                key={option}
                type="button"
                disabled={pending}
                onClick={() => vote(i)}
                className="rounded-full border border-neutral-800 px-4 py-2 text-left text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900 disabled:opacity-50"
              >
                {option}
              </button>
            );
          }
          return (
            <button
              key={option}
              type="button"
              disabled={pending}
              onClick={() => vote(i)}
              className="relative overflow-hidden rounded-full border border-neutral-800 px-4 py-2 text-left text-sm transition disabled:opacity-50"
              aria-label={`${option}: ${pct}%${mine ? " (your vote)" : ""}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${mine ? "bg-neutral-700" : "bg-neutral-800/70"}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className={mine ? "font-medium text-white" : "text-neutral-300"}>
                  {option}
                  {mine ? " · you" : ""}
                </span>
                <span className="font-mono text-xs text-neutral-400">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] text-neutral-600">
        {total === 0
          ? "No votes yet today — yours could be the first."
          : `${total} vote${total === 1 ? "" : "s"} today${showResults ? " · tap another option to change yours" : ""}`}
      </p>
      {error ? <p className="mt-1 text-[11px] text-red-400">{error}</p> : null}
    </section>
  );
}
