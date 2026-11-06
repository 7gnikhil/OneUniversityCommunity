"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  directAddMemberAction,
  ensureShareInviteAction,
  regenerateInviteAction,
} from "../actions";

// Server settings panel (normal servers): member list, invite code +
// share link (owner/mods can regenerate), and direct-add of my matches.
// Rendered below the chat; membership data arrives from the server page.
export interface MemberEntryData {
  accountId: string;
  name: string;
  username: string;
  photoUrl: string | null;
  role: string;
}

export interface AddableFriendData {
  accountId: string;
  name: string;
  username: string;
  photoUrl: string | null;
}

export default function ServerSettings({
  serverId,
  members,
  isStaff,
  addableFriends,
  initialInviteCode,
}: {
  serverId: string;
  members: MemberEntryData[];
  isStaff: boolean;
  addableFriends: AddableFriendData[];
  initialInviteCode: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);
  const [inviteCode, setInviteCode] = useState<string | null>(initialInviteCode);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());

  const inviteLink =
    inviteCode && typeof window !== "undefined"
      ? `${window.location.origin}/servers/join/${inviteCode}`
      : inviteCode
        ? `/servers/join/${inviteCode}`
        : null;

  async function onEnsureCode(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await ensureShareInviteAction(serverId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInviteCode(result.code);
  }

  async function onRegenerate(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await regenerateInviteAction(serverId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInviteCode(result.code);
    setCopied(false);
  }

  async function onCopy(): Promise<void> {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setError("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  async function onAdd(friend: AddableFriendData): Promise<void> {
    setError(null);
    const result = await directAddMemberAction(serverId, friend.accountId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAddedIds((prev) => new Set(prev).add(friend.accountId));
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-full border border-neutral-800 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-neutral-900"
      >
        Members &amp; invites ({members.length})
      </button>
    );
  }

  return (
    <section className="mt-3 flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Members &amp; invites</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 transition hover:text-white"
        >
          Close
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {isStaff ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Invite people
          </p>
          {inviteCode ? (
            <>
              <p className="text-sm">
                Code: <span className="font-mono font-semibold tracking-widest">{inviteCode}</span>
              </p>
              <p className="break-all text-xs text-neutral-500">{inviteLink}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onCopy()}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200"
                >
                  {copied ? "Copied ✓" : "Copy invite link"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRegenerate()}
                  className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-40"
                >
                  {busy ? "…" : "Regenerate code"}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600">
                Regenerating retires the old code and link.
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnsureCode()}
              className="w-fit rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-40"
            >
              {busy ? "…" : "Create invite code"}
            </button>
          )}
        </div>
      ) : null}

      {isStaff && addableFriends.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Add your matches directly
          </p>
          <ul className="flex flex-col divide-y divide-neutral-900">
            {addableFriends.map((friend) => (
              <li key={friend.accountId} className="flex items-center gap-3 py-2">
                <Avatar name={friend.name} photoUrl={friend.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{friend.name}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    @{friend.username}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={addedIds.has(friend.accountId)}
                  onClick={() => void onAdd(friend)}
                  className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-40"
                >
                  {addedIds.has(friend.accountId) ? "Added ✓" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          Members ({members.length})
        </p>
        <ul className="flex flex-col divide-y divide-neutral-900">
          {members.map((member) => (
            <li key={member.accountId} className="flex items-center gap-3 py-2">
              <Avatar name={member.name} photoUrl={member.photoUrl} />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/profile/${member.username}`}
                  className="block truncate text-sm transition hover:underline"
                >
                  {member.name}
                </Link>
                <span className="block truncate text-xs text-neutral-500">
                  @{member.username}
                </span>
              </span>
              {member.role !== "member" ? (
                <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neutral-300">
                  {member.role}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-400">
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}
