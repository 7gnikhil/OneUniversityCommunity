"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAccountVerifiedAction } from "./actions";

// "Mark verified" for one legacy pending_verification account. On
// success the list refreshes (the row leaves the pending filter / its
// chip flips to verified); on failure the error shows inline.
export default function MarkVerifiedButton({
  accountId,
}: {
  accountId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  function onClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await markAccountVerifiedAction(accountId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return <p className="text-xs font-medium text-emerald-400">Verified ✓</p>;
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark verified"}
      </button>
      {error ? (
        <span className="text-[11px] text-red-400" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
