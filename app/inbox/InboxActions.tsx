"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInviteAction, declineInviteAction } from "./actions";
import { respondFollowRequestAction } from "../follow/actions";
import {
  respondRevealAction,
  revokeRevealAction,
} from "../servers/reveal-actions";

// Small client islands for the Inbox's actionable entries: follow
// requests (accept/decline), reveal requests (accept/decline), granted
// reveals (revoke), group invites (accept/decline). Everything else in
// the Inbox is read-only notices.

export function RevealRequestButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function respond(accept: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await respondRevealAction(requestId, accept);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(accept ? "Shared ✓" : "Declined");
    router.refresh();
  }

  if (done) return <p className="text-xs text-emerald-400">{done}</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void respond(true)}
          className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
        >
          Accept — share my profile
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void respond(false)}
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function FollowRequestButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function respond(accept: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await respondFollowRequestAction(requestId, accept);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(accept ? "Homies now ✓" : "Declined");
    router.refresh();
  }

  if (done) return <p className="text-xs text-emerald-400">{done}</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void respond(true)}
          className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
        >
          Accept — become friends
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void respond(false)}
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function RevokeRevealButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onRevoke(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await revokeRevealAction(requestId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onRevoke()}
        className="rounded-full border border-red-900 px-3 py-1 text-xs text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
      >
        {busy ? "…" : "Revoke — go anonymous again"}
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

export function InviteButtons({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await acceptInviteAction(inviteId);
    setBusy(false);
    if (result.error || !result.serverId) {
      setError(result.error ?? "Couldn't join.");
      return;
    }
    router.push(`/servers/${result.serverId}`);
  }

  async function onDecline(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await declineInviteAction(inviteId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAccept()}
          className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50"
        >
          Accept &amp; join
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDecline()}
          className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function RevealedProfileLink({ username }: { username: string }) {
  return (
    <Link
      href={`/profile/${username}`}
      className="text-xs font-medium text-sky-300 transition hover:underline"
    >
      View their profile →
    </Link>
  );
}
