"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinByInviteCodeAction } from "../../actions";

// Join button for an invite landing page; on success it routes straight
// into the server.
export default function JoinInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await joinByInviteCodeAction(code);
    setBusy(false);
    if (result.error || !result.serverId) {
      setError(result.error ?? "That invite didn't work.");
      return;
    }
    router.push(`/servers/${result.serverId}`);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onJoin()}
        className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
      >
        {busy ? "Joining…" : "Join Tea"}
      </button>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
