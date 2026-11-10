"use client";

import { useState } from "react";
import {
  cancelFollowRequestAction,
  sendFollowRequestAction,
  type FollowUiState,
} from "@/app/follow/actions";

// Follow / Requested / Friends pill for profile pages and search
// results. The server resolves the initial state (lib/follows
// getFollowState); taps go through app/follow/actions.ts, which derives
// the actor from the session — this component only holds display state.
//   follow    → tap sends the request
//   requested → tap again withdraws it (no confirm — the usual pattern)
//   friends   → disabled pill (accepted follow or mutual swipe)
//   self      → renders nothing
export default function FollowButton({
  targetAccountId,
  initialState,
  accentHex,
  small = false,
}: {
  targetAccountId: string;
  initialState: FollowUiState;
  accentHex: string;
  small?: boolean;
}) {
  const [state, setState] = useState<FollowUiState>(initialState);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "self") return null;

  const sizeClass = small ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-xs";

  async function onFollow(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await sendFollowRequestAction(targetAccountId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.state) setState(result.state);
  }

  async function onCancel(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await cancelFollowRequestAction(targetAccountId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.state) setState(result.state);
  }

  return (
    <span className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-2">
        {state === "friends" ? (
          <span
            className={`rounded-full border border-neutral-700 font-medium text-neutral-300 ${sizeClass}`}
          >
            Homies ✓
          </span>
        ) : state === "requested" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onCancel()}
            className={`rounded-full border border-neutral-600 font-medium text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-50 ${sizeClass}`}
          >
            {busy ? "…" : "Requested"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onFollow()}
            style={{ backgroundColor: accentHex }}
            className={`rounded-full border border-white/25 font-medium text-white transition hover:opacity-90 disabled:opacity-50 ${sizeClass}`}
          >
            {busy ? "…" : "Follow"}
          </button>
        )}
      </span>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}
