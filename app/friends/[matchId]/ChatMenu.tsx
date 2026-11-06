"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { blockChatAction, unmatchAction } from "../actions";

// Small overflow menu in the chat header: view profile, unmatch, block.
// Unmatch and block ask for confirmation inline (two-step buttons) — both
// end the conversation; block additionally hides the pair from each
// other's deck/search everywhere.
export default function ChatMenu({
  matchId,
  otherName,
  otherUsername,
}: {
  matchId: string;
  otherName: string;
  otherUsername: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<"unmatch" | "block" | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "unmatch" | "block"): Promise<void> {
    setBusy(true);
    const result =
      kind === "unmatch"
        ? await unmatchAction(matchId)
        : await blockChatAction(matchId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/friends");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Chat options"
        onClick={() => {
          setOpen((value) => !value);
          setConfirming(null);
          setError(null);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-300 transition hover:bg-neutral-900"
      >
        ⋮
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-20 w-60 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-xl">
          <button
            type="button"
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-900"
            onClick={() => {
              setOpen(false);
              router.push(`/profile/${otherUsername}`);
            }}
          >
            View {otherName}&apos;s profile
          </button>
          {confirming === null ? (
            <>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-900"
                onClick={() => setConfirming("unmatch")}
              >
                Unmatch
              </button>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-400 transition hover:bg-neutral-900"
                onClick={() => setConfirming("block")}
              >
                Block {otherName}
              </button>
            </>
          ) : (
            <div className="px-3 py-2">
              <p className="text-sm leading-relaxed text-neutral-300">
                {confirming === "unmatch"
                  ? `Unmatch ${otherName}? This chat and its messages will be deleted.`
                  : `Block ${otherName}? The chat ends, and you won't see each other in the deck or search again.`}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(confirming)}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {busy
                    ? "Working…"
                    : confirming === "unmatch"
                      ? "Yes, unmatch"
                      : "Yes, block"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error ? (
            <p className="px-3 py-2 text-xs text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
