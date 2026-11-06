"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinServerAction } from "../actions";

// Join button shown on public servers the viewer hasn't joined yet.
export default function JoinServerButton({ serverId }: { serverId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await joinServerAction(serverId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onJoin()}
        className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
      >
        {busy ? "Joining…" : "Join"}
      </button>
      {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
    </span>
  );
}
