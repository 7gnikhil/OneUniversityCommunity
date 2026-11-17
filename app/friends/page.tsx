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
import PageIntro from "@/components/PageIntro";
import Avatar from "@/components/Avatar";

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
        <h1 className="text-xl font-semibold">Homies</h1>
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
    <main data-section="friends" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/swipe"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Homies
        </p>
      </div>

      <PageIntro section="friends" />

      {/* Online-now rail (Discord, queued feature approved
          2026-11-17): friends who are online right now, one tap
          into the chat. Only friends who share their status ever
          appear — onlineIds is already privacy-shaped. */}
      {entries.some((entry) => onlineIds.has(entry.other.accountId)) ? (
        <div className="flex gap-3 overflow-x-auto pb-1 pt-1">
          {entries
            .filter((entry) => onlineIds.has(entry.other.accountId))
            .map((entry) => {
              const name = entry.other.name.trim()
                ? entry.other.name
                : `@${entry.other.username}`;
              return (
                <Link
                  key={entry.matchId}
                  href={`/friends/${entry.matchId}`}
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                >
                  <span className="relative">
                    <Avatar
                      name={name}
                      photoUrl={entry.other.photoUrl}
                      alt={name}
                      letter={name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
                      sizeClass="h-14 w-14"
                      textClass="text-lg"
                    />
                    <span
                      className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-black"
                      aria-label="Online now"
                    />
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-neutral-300">
                    {name.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-10 text-center">
          <p className="text-base font-semibold">No matches yet</p>
          <p className="text-sm leading-relaxed text-neutral-400">
            When you and someone like each other in Fling, your chat opens
            here.
          </p>
          <Link
            href="/swipe"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            Open Fling
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
  // WhatsApp's list voice: "Yesterday", then the date.
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
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
      ? lastMessage.body
      : lastMessage.fromMe
        ? "📷 Photo"
        : "📷 Photo"
    : "Say hello 👋";
  const hasUnread = entry.unreadCount > 0;
  return (
    <li>
      {/* WhatsApp chat list row (2026-11-17): 48px avatar, name +
          time on line one (time turns WhatsApp green when unread),
          tick + preview + green count badge on line two. */}
      <Link
        href={`/friends/${entry.matchId}`}
        className="flex items-center gap-3 px-1 py-3 transition hover:bg-white/[0.03]"
      >
        <span className="relative shrink-0">
          <Avatar
            name={displayName}
            photoUrl={other.photoUrl}
            alt={displayName}
            letter={displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
            sizeClass="h-12 w-12"
            textClass="text-base"
          />
          {online ? (
            <span
              className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-black"
              aria-label="Online now"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-medium text-white">{displayName}</span>
            {lastMessage ? (
              <span
                className={`shrink-0 text-xs ${
                  hasUnread ? "font-medium text-emerald-400" : "text-neutral-500"
                }`}
              >
                {formatTime(lastMessage.createdAt)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={`flex min-w-0 items-center gap-1 truncate text-sm ${
                hasUnread ? "font-medium text-neutral-200" : "text-neutral-400"
              }`}
            >
              {lastMessage?.fromMe ? (
                <span
                  className={`shrink-0 text-[13px] leading-none ${
                    lastMessage.read ? "text-[#53bdeb]" : "text-neutral-500"
                  }`}
                  aria-label={lastMessage.read ? "Read" : lastMessage.delivered ? "Delivered" : "Sent"}
                >
                  {lastMessage.delivered || lastMessage.read ? "✓✓" : "✓"}
                </span>
              ) : null}
              <span className="truncate">{preview}</span>
            </span>
            {hasUnread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-black">
                {entry.unreadCount > 99 ? "99+" : entry.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
