import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  getMatchById,
  getPublicProfilesByIds,
  listMessages,
  otherPartyId,
} from "@/lib/social";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;
  if (!account) redirect("/friends");
  const me = account;

  const match = await getMatchById(supabase, matchId);
  if (!match || (match.account_a !== me.id && match.account_b !== me.id)) {
    redirect("/friends");
  }
  const confirmedMatch = match;

  const otherId: string = otherPartyId(confirmedMatch, me.id);
  const profilesById = await getPublicProfilesByIds(supabase, [otherId]);
  const other = profilesById.get(otherId);
  if (!other) redirect("/friends");
  const otherProfile = other;

  const myProfile = await getProfileByAccountId(supabase, me.id);
  const initialMessages = await listMessages(supabase, confirmedMatch.id, 200);

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
        initialMessages={initialMessages}
      />
    </main>
  );
}
