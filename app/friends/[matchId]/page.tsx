import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  getMatchById,
  getPublicProfilesByIds,
  listMessages,
  otherPartyId,
  type MessageRow,
} from "@/lib/social";
import {
  getPresenceMap,
  getPrivacySettings,
  isOnline,
} from "@/lib/presence";
import { accentHex } from "@/lib/validation";
import ChatMenu from "./ChatMenu";
import ChatView from "./ChatView";

// One DM conversation. Access is double-checked here (middleware only
// knows I'm signed in + verified): the match must exist and I must be one
// of its two parties — anything else bounces to the Friends list. The
// other party's identity comes from the public_profiles view only.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createClient();

  const account = await getMyAccount(supabase);
  if (!account) redirect("/friends");
  const me = account;

  const match = await getMatchById(supabase, matchId);
  if (!match || (match.account_a !== me.id && match.account_b !== me.id)) {
    redirect("/friends");
  }
  const confirmedMatch = match;

  const otherId: string = otherPartyId(confirmedMatch, me.id);
  // The other party's public profile, my own profile (for the accent
  // colour) and the message history are independent reads — fetch all
  // three together instead of one after the other.
  const [profilesById, myProfile, initialMessages] = await Promise.all([
    getPublicProfilesByIds(supabase, [otherId]),
    getProfileByAccountId(supabase, me.id),
    listMessages(supabase, confirmedMatch.id, 200),
  ]);
  const other = profilesById.get(otherId);
  if (!other) redirect("/friends");
  const otherProfile = other;

  // Presence + tick privacy for the first paint (the poll refreshes
  // both every 5s after that). Service role, fail-soft: without it the
  // header simply starts with no status line. The other party's privacy
  // switches gate everything: online status hidden → no online, no
  // last seen; read receipts off → my messages' read_at is stripped
  // before it ever reaches the client.
  let shapedMessages: MessageRow[] = initialMessages;
  let initialPeerOnline: boolean | null = null;
  let initialPeerLastSeen: string | null = null;
  try {
    const admin = createAdminClient();
    const [peerPrivacy, presenceById] = await Promise.all([
      getPrivacySettings(admin, otherId),
      getPresenceMap(admin, [otherId]),
    ]);
    if (!peerPrivacy.readReceipts) {
      shapedMessages = initialMessages.map((row) =>
        row.sender_id === me.id ? { ...row, read_at: null } : row,
      );
    }
    if (peerPrivacy.showOnline) {
      const presence = presenceById.get(otherId) ?? null;
      initialPeerOnline = isOnline(presence);
      initialPeerLastSeen = presence?.last_seen_at ?? null;
    }
  } catch {
    // Presence is decoration — the chat itself must never wait on it.
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col px-4 pb-2 pt-4">
      <header className="flex items-center gap-3 border-b border-neutral-900 pb-3">
        <Link
          href="/friends"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ←
        </Link>
        <Link
          href={`/profile/${otherProfile.username}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {otherProfile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={otherProfile.photoUrl}
              alt={otherProfile.name}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-400">
              {otherProfile.name.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {otherProfile.name}
            </span>
            <span className="block truncate text-xs text-neutral-500">
              @{otherProfile.username}
            </span>
          </span>
        </Link>
        <ChatMenu
          matchId={confirmedMatch.id}
          otherName={otherProfile.name}
          otherUsername={otherProfile.username}
        />
      </header>

      <ChatView
        matchId={confirmedMatch.id}
        myAccountId={me.id}
        otherName={otherProfile.name}
        accentHex={accentHex(myProfile?.accent_color)}
        initialMessages={shapedMessages}
        initialPeerOnline={initialPeerOnline}
        initialPeerLastSeen={initialPeerLastSeen}
      />
    </main>
  );
}
