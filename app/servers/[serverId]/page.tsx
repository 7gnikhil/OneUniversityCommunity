import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { passesAdminGate } from "@/lib/auth/account";
import { getMyAccount, getMySessionUser } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  canViewServer,
  countServerMembers,
  ensureDefaultChannel,
  ensureMainServer,
  getJwalamPinned,
  getMembership,
  getReqToAdminFlair,
  getServerById,
  getServerShareInvite,
  isServerStaff,
  listFlairs,
  listJwalamMessages,
  listServerMembers,
  listServerMessages,
  recordJwalamViews,
  type ServerRow,
} from "@/lib/servers";
import { getMyMatches, getPublicProfilesByIds, otherPartyId } from "@/lib/social";
import { accentHex } from "@/lib/validation";
import JwalamChat from "./JwalamChat";
import ServerChat from "./ServerChat";
import ServerSettings, {
  type AddableFriendData,
  type MemberEntryData,
} from "./ServerSettings";
import JoinServerButton from "./JoinServerButton";

// One server. Two shapes:
//  - Maya Jwalam (servers.is_main_channel): Telegram-style + ANONYMOUS.
//    Messages come from the identity-stripping projection in lib/servers;
//    the member list is never loaded here (count only).
//  - Every other server: Discord-style channels + messages + members.
// Visibility is enforced HERE in code (data loads run on the service
// role): public = any verified student; private = members/creator/admin.
export default async function ServerPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { serverId } = await params;
  const { channel: requestedChannel } = await searchParams;

  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  const sessionUser = await getMySessionUser(supabase);
  if (!account) {
    return (
      <Shell title="Tea">
        <p className="text-sm text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first.
        </p>
        <Link
          href="/verify"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Go to account setup
        </Link>
      </Shell>
    );
  }
  const me = account;
  const isAppAdmin = passesAdminGate(sessionUser?.email, me);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return (
      <Shell title="Tea">
        <p className="text-sm text-amber-200">
          Tea isn&apos;t fully configured yet — please try again shortly.
        </p>
      </Shell>
    );
  }

  let server: ServerRow | null = await getServerById(admin, serverId);
  if (!server && serverId) {
    // Deep link to the main channel before it was ever listed.
    const main = await ensureMainServer(admin);
    if (main && main.id === serverId) server = main;
  }
  if (!server) {
    return (
      <Shell title="Tea">
        <p className="text-sm text-neutral-400">That Tea doesn&apos;t exist.</p>
        <Link href="/servers" className="text-sm text-neutral-300 underline">
          Back to Tea
        </Link>
      </Shell>
    );
  }
  const confirmedServer: ServerRow = server;

  // Membership and my own profile are independent reads — fetch both
  // together instead of one after the other.
  const [fetchedMembership, myProfile] = await Promise.all([
    getMembership(admin, confirmedServer.id, me.id),
    getProfileByAccountId(supabase, me.id),
  ]);
  let membership = fetchedMembership;
  const accent = accentHex(myProfile?.accent_color);

  // ── Maya Jwalam ──────────────────────────────────────────────────────────
  if (confirmedServer.is_main_channel) {
    if (!membership) {
      // The main channel auto-joins every verified student on first open.
      await admin.from("server_members").upsert(
        { server_id: confirmedServer.id, account_id: me.id, role: "member" },
        { onConflict: "server_id,account_id", ignoreDuplicates: true },
      );
      membership = await getMembership(admin, confirmedServer.id, me.id);
    }
    await recordJwalamViews(admin, confirmedServer.id, me.id);
    const [messages, memberCount, flairs] = await Promise.all([
      listJwalamMessages(admin, confirmedServer.id, me.id, isAppAdmin, 100),
      countServerMembers(admin, confirmedServer.id),
      listFlairs(admin, confirmedServer.id),
    ]);
    const pinnedInWindow = [...messages].reverse().find((row) => row.isPinned) ?? null;
    const pinned =
      pinnedInWindow ??
      (await getJwalamPinned(admin, confirmedServer.id, me.id, isAppAdmin));

    return (
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col px-4 pb-2 pt-4">
        <JwalamChat
          serverId={confirmedServer.id}
          serverName={confirmedServer.name}
          serverIconUrl={confirmedServer.icon_url}
          memberCount={memberCount}
          initialMessages={messages}
          pinned={pinned}
          flairs={flairs}
          myAccountId={me.id}
          accentHex={accent}
          isAppAdmin={isAppAdmin}
        />
      </main>
    );
  }

  // ── Normal servers ───────────────────────────────────────────────────────
  if (!canViewServer(confirmedServer, membership, me.id, isAppAdmin)) {
    return (
      <Shell title={confirmedServer.name}>
        <p className="text-sm leading-relaxed text-neutral-400">
          This Tea is private. You&apos;ll need an invite code, an invite
          link, or a direct add from a member to get in.
        </p>
        <Link href="/servers" className="text-sm text-neutral-300 underline">
          Back to Tea
        </Link>
      </Shell>
    );
  }

  const staff = isServerStaff(membership, confirmedServer, me.id, isAppAdmin);
  // Only the message list depends on the channel set (it needs the
  // active channel); flairs and the member list are independent, so
  // they load alongside the channel ensure instead of behind it.
  const [channels, flairs, reqFlair, memberEntries] = await Promise.all([
    ensureDefaultChannel(admin, confirmedServer.id),
    listFlairs(admin, confirmedServer.id),
    getReqToAdminFlair(admin),
    listServerMembers(admin, confirmedServer.id),
  ]);
  const activeChannel =
    channels.find((row) => row.id === requestedChannel) ?? channels[0] ?? null;
  const messages = await listServerMessages(
    admin,
    confirmedServer.id,
    activeChannel?.id ?? null,
    me.id,
    100,
  );

  const memberData: MemberEntryData[] = memberEntries
    .filter((entry) => entry.profile !== null)
    .map((entry) => ({
      accountId: entry.membership.account_id,
      name: entry.profile?.name ?? "A student",
      username: entry.profile?.username ?? "",
      photoUrl: entry.profile?.photoUrl ?? null,
      role: entry.membership.role,
      developer: entry.profile?.developer ?? false,
    }));

  // Direct-add candidates (my matches who aren't already members) and
  // the share invite are independent loads — run them together.
  let addableFriends: AddableFriendData[] = [];
  let shareInvite: Awaited<ReturnType<typeof getServerShareInvite>> = null;
  if (staff) {
    const loadAddableFriends = async (): Promise<AddableFriendData[]> => {
      const memberIds = new Set(
        memberEntries.map((entry) => entry.membership.account_id),
      );
      const matches = await getMyMatches(supabase, me.id);
      const otherIds = matches
        .map((match) => otherPartyId(match, me.id))
        .filter((id) => !memberIds.has(id));
      const profiles = await getPublicProfilesByIds(admin, otherIds);
      return otherIds
        .map((id) => profiles.get(id))
        .filter(
          (profile): profile is NonNullable<typeof profile> =>
            profile !== undefined,
        )
        .map((profile) => ({
          accountId: profile.accountId,
          name: profile.name,
          username: profile.username,
          photoUrl: profile.photoUrl,
        }));
    };
    [addableFriends, shareInvite] = await Promise.all([
      loadAddableFriends(),
      getServerShareInvite(admin, confirmedServer.id),
    ]);
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col px-4 pb-2 pt-4">
      <header className="flex items-center gap-3 border-b border-neutral-900 pb-3">
        <Link href="/servers" className="text-sm text-neutral-400 transition hover:text-white">
          ←
        </Link>
        {confirmedServer.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={confirmedServer.icon_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-300">
            {confirmedServer.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{confirmedServer.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {confirmedServer.type === "public"
              ? "Public Tea"
              : confirmedServer.type === "friends_private"
                ? "Private · friends"
                : "Private · strangers"}
            {` · ${memberEntries.length} member${memberEntries.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {!membership ? <JoinServerButton serverId={confirmedServer.id} /> : null}
      </header>

      {channels.length > 1 ? (
        <nav className="flex flex-wrap gap-1.5 pt-3">
          {channels.map((channelRow) => (
            <Link
              key={channelRow.id}
              href={`/servers/${confirmedServer.id}?channel=${channelRow.id}`}
              className={`rounded-full px-3 py-1 text-xs transition ${
                activeChannel?.id === channelRow.id
                  ? "bg-white font-medium text-black"
                  : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }`}
            >
              # {channelRow.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <ServerChat
        serverId={confirmedServer.id}
        channelId={activeChannel?.id ?? null}
        initialMessages={messages}
        flairs={flairs}
        reqToAdminFlairId={reqFlair?.id ?? null}
        myAccountId={me.id}
        accentHex={accent}
        canPost={membership !== null || isAppAdmin}
        isStaff={staff}
        isAppAdmin={isAppAdmin}
      />

      <ServerSettings
        serverId={confirmedServer.id}
        members={memberData}
        isStaff={staff}
        addableFriends={addableFriends}
        initialInviteCode={shareInvite?.invite_code ?? null}
      />
    </main>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}
