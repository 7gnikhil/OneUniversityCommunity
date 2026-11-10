import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  listDmEntries,
  markIncomingDelivered,
  type DmListEntry,
} from "@/lib/social";
import {
  getPresenceMap,
  getPrivacyMap,
  isOnline,
} from "@/lib/presence";
import { accentHex } from "@/lib/validation";

// Friends — the dial's chat stop: my matches and their DM threads.
//
// Everything shown about the other person comes from the public_profiles
// view (avatar, name, @username). Unread = their messages with
// read_at null (see lib/social.ts for the mechanism). Ordering follows
// matches.updated_at, which the send action bumps on every message.
export default async function FriendsPage() {
  const supabase = await createClient();

  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Friends</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          your chats show up here.
        </p>
        <Link
          href="/verify"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Go to account setup
        </Link>
      </main>
    );
  }

  // My profile (for the accent colour) and the DM list are independent
  // reads — fetch them together.
  const [myProfile, entries] = await Promise.all([
    getProfileByAccountId(supabase, account.id),
    listDmEntries(supabase, account.id),
  ]);
  const accent = accentHex(myProfile?.accent_color);

  // Delivery + presence, both service-role and fail-soft:
  //  - loading this list means my client now HOLDS the incoming
  //    messages, so they count as delivered (the senders' grey ticks
  //    turn double on their next poll);
  //  - a green dot shows on friends who are online AND whose "show my
  //    online status" switch is on — a hidden status shows no dot,
  //    exactly like WhatsApp's last-seen privacy.
  const onlineIds = new Set<string>();
  if (entries.length > 0) {
    try {
      const admin = createAdminClient();
      const otherIds = entries.map((entry) => entry.other.accountId);
      await markIncomingDelivered(admin, account.id);
      const [presenceById, privacyById] = await Promise.all([
        getPresenceMap(admin, otherIds),
        getPrivacyMap(admin, otherIds),
      ]);
      otherIds.forEach((id) => {
        if (
          privacyById.get(id)?.showOnline !== false &&
          isOnline(presenceById.get(id))
        ) {
          onlineIds.add(id);
        }
      });
    } catch {
      // Dots and ticks are best-effort; the list itself already loaded.
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Friends
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-10 text-center">
          <p className="text-base font-semibold">No matches yet</p>
          <p className="text-sm leading-relaxed text-neutral-400">
            When you and someone like each other in the Swipe Deck, your chat
            opens here.
          </p>
          <Link
            href="/swipe"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            Open the Swipe Deck
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-900">
          {entries.map((entry) => (
            <DmRow
              key={entry.matchId}
              entry={entry}
              accent={accent}
              online={onlineIds.has(entry.other.accountId)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function DmRow({
  entry,
  accent,
  online,
}: {
  entry: DmListEntry;
  accent: string;
  online: boolean;
}) {
  const { other, lastMessage } = entry;
  // Display name is optional at sign-up — fall back to the @handle so a
  // friend who skipped it never renders as a blank row.
  const displayName = other.name.trim() ? other.name : `@${other.username}`;
  const preview = lastMessage
    ? lastMessage.body
      ? `${lastMessage.fromMe ? "You: " : ""}${lastMessage.body}`
      : lastMessage.fromMe
        ? "You sent a photo"
        : "Sent you a photo"
    : "Say hello 👋";
  return (
    <li>
      <Link
        href={`/friends/${entry.matchId}`}
        className="flex items-center gap-3 py-3 transition hover:bg-neutral-950"
      >
        <span className="relative shrink-0">
          {other.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={other.photoUrl}
              alt={displayName}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-base font-semibold text-neutral-400">
              {displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {online ? (
            <span
              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-black"
              aria-label="Online now"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {lastMessage ? (
              <span className="shrink-0 text-[11px] text-neutral-500">
                {formatTime(lastMessage.createdAt)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-neutral-500">
              {preview}
            </span>
            {entry.unreadCount > 0 ? (
              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
