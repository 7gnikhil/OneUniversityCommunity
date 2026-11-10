"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordSwipeAction } from "../actions";

// Fling / Pass from the stranger's Fling profile view — the SAME
// actions the deck card's buttons call (recordSwipeAction), so acting
// here consumes the card exactly like swiping it would. A match shows
// the moment here; anything else returns to the deck, which re-deals
// without this person (the swipe is now on record).
export default function FlingActions({
  candidateId,
  displayName,
  accentHex: accent,
}: {
  candidateId: string;
  displayName: string;
  accentHex: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<{ matchId: string } | null>(null);

  async function act(direction: "like" | "pass"): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await recordSwipeAction(candidateId, direction);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    if (result.matched && result.matchId) {
      setBusy(false);
      setMatched({ matchId: result.matchId });
      return;
    }
    router.push("/swipe");
    router.refresh();
  }

  if (matched) {
    return (
      <div className="w-full rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-center shadow-xl">
        <p className="text-base font-semibold">It&apos;s a match! 🎉</p>
        <p className="mt-1 text-sm text-neutral-400">
          You and {displayName} liked each other. Be the first to message
          them.
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Link
            href={`/friends/${matched.matchId}`}
            className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            Message them
          </Link>
          <Link
            href="/swipe"
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
          >
            Back to Fling
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void act("pass")}
          disabled={busy}
          aria-label="Pass"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-neutral-700 text-2xl text-rose-400 transition hover:bg-neutral-900 disabled:opacity-40"
        >
          ✕
        </button>
        <span className="text-xs text-neutral-500">Pass · Fling</span>
        <button
          type="button"
          onClick={() => void act("like")}
          disabled={busy}
          aria-label="Fling"
          className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          ♥
        </button>
      </div>
    </div>
  );
}
