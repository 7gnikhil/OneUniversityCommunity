"use client";

import { useState, useTransition } from "react";
import { rateProfileAction } from "@/app/swipe/rating-actions";

// The 1–10 rating control for Fling (owner's feature, 2026-11-11).
// Shown under the deck card's buttons and on the Fling profile
// page. Tapping a number sets my rating for that profile; tapping
// another changes it. Deliberately separate from Like/Pass — a
// rating never swipes the card. Optimistic, with rollback and a
// small error line if the write fails.

interface RateProfileProps {
  accountId: string;
  initialRating: number | null;
  /** Shown in the label, e.g. "Rate @ananya.s". */
  label: string;
}

export default function RateProfile({
  accountId,
  initialRating,
  label,
}: RateProfileProps) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rate = (value: number) => {
    if (pending || value === rating) return;
    const previous = rating;
    setError(null);
    setRating(value);
    startTransition(async () => {
      const result = await rateProfileAction(accountId, value);
      if (!result.ok) {
        setRating(previous);
        setError(result.error ?? "Your rating didn't land — try again.");
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        <span className="mr-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          Rate
        </span>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
          const active = rating !== null && value <= rating;
          const exact = rating === value;
          return (
            <button
              key={value}
              type="button"
              disabled={pending}
              onClick={() => rate(value)}
              aria-label={`Rate ${value} out of 10`}
              aria-pressed={exact}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-medium transition disabled:opacity-50 ${
                exact
                  ? "border-white bg-white text-black"
                  : active
                    ? "border-neutral-400 bg-neutral-700 text-white"
                    : "border-neutral-800 text-neutral-400 hover:border-neutral-500 hover:text-white"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-neutral-600">
        {rating !== null
          ? `You rated ${rating}/10 — tap another number to change it.`
          : label}
      </p>
      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
