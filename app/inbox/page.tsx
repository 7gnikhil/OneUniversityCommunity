import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import {
  listInboxItems,
  listPendingDirectInvites,
  type InboxItemRow,
} from "@/lib/inbox";
import {
  listPendingFollowRequests,
  type PendingFollowEntry,
} from "@/lib/follows";
import { FollowRequestButtons, InviteButtons } from "./InboxActions";
import PageIntro from "@/components/PageIntro";
import Avatar from "@/components/Avatar";

// Inbox — everything addressed to me that isn't a chat:
//   - follow requests (accept/decline — accepting makes us friends)
//   - group invites addressed to me (accept/decline)
//   - delivered notices: developer-request updates, admin notices,
//     verification outcomes (inbox_items)
// Viewing marks the delivered notices read (inbox_update_own RLS policy);
// actionable entries clear when acted on, not when viewed.
// (Profile-reveal requests lived here until 2026-11-17, when the
// "show me your profile" feature was removed.)
export default async function InboxPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          your inbox opens up.
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
  const me = account;

  let items: InboxItemRow[] = [];
  let pendingFollows: PendingFollowEntry[] = [];
  let pendingInvites: Awaited<ReturnType<typeof listPendingDirectInvites>> = [];
  let adminReady = true;
  try {
    const admin = createAdminClient();
    [items, pendingFollows, pendingInvites] = await Promise.all([
      listInboxItems(supabase, me.id, 50),
      listPendingFollowRequests(admin, me.id),
      listPendingDirectInvites(admin, me.id),
    ]);
  } catch {
    adminReady = false;
    items = await listInboxItems(supabase, me.id, 50);
  }

  // Mark delivered notices read now that they've been rendered.
  const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
  if (unreadIds.length > 0) {
    await supabase
      .from("inbox_items")
      .update({ is_read: true })
      .in("id", unreadIds)
      .eq("recipient_id", me.id);
  }

  const empty =
    items.length === 0 &&
    pendingFollows.length === 0 &&
    pendingInvites.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/swipe" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Inbox
        </p>
      </div>

      <PageIntro section="inbox" />

      {!adminReady ? (
        <p className="rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          Some inbox sections aren&apos;t fully configured yet — notices below
          still work.
        </p>
      ) : null}

      {empty ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-10 text-center">
          <p className="text-base font-semibold">All quiet</p>
          <p className="text-sm leading-relaxed text-neutral-400">
            Follow requests, group invites, developer-request updates
            and admin notices will land here.
          </p>
        </div>
      ) : null}

      {pendingFollows.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Follow requests
          </h2>
          {pendingFollows.map(({ request, requester }) =>
            requester ? (
              <article
                key={request.id}
                className="flex flex-col gap-2 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={requester.name}
                    photoUrl={requester.photoUrl}
                    sizeClass="h-10 w-10"
                    textClass="text-sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{requester.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      @{requester.username} wants to follow you
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-neutral-400">
                  Accepting makes you friends: you can message each other and
                  see each other&apos;s full profile. Declining keeps things
                  as they are.
                </p>
                <FollowRequestButtons requestId={request.id} />
              </article>
            ) : null,
          )}
        </section>
      ) : null}

      {pendingInvites.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Group invites
          </h2>
          {pendingInvites.map(({ invite, server }) => (
            <article
              key={invite.id}
              className="flex flex-col gap-2 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="text-sm font-medium">
                You&apos;ve been added to {server?.name ?? "a Tea"}
              </p>
              <p className="text-sm leading-relaxed text-neutral-400">
                A server owner or mod added you directly. Accept to open the
                server, or decline to dismiss the invite.
              </p>
              <InviteButtons inviteId={invite.id} />
            </article>
          ))}
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Notices
          </h2>
          {items.map((item) => (
            <article
              key={item.id}
              className="flex flex-col gap-1 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                {!item.is_read ? (
                  <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-300">
                    New
                  </span>
                ) : null}
              </div>
              {item.body ? (
                <p className="text-sm leading-relaxed text-neutral-400">{item.body}</p>
              ) : null}
              <p className="text-[11px] text-neutral-600">
                {new Date(item.created_at).toLocaleString([], {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
