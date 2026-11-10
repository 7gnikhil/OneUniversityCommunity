import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getReqToAdminFlair, type ServerMessageRow } from "@/lib/servers";
import { getPublicProfilesByIds } from "@/lib/social";
import { REVEAL_COLUMNS, type RevealRequestRow } from "@/lib/inbox";

// ReqToAdmin queue: every server message students flagged with the
// built-in ReqToAdmin flair (authors flag their own posts; mods can flag
// any), with links into the server for context — plus an overview of
// pending Maya Jwalam reveal requests (moderation visibility only; the
// poster answers those in their own Inbox).
export default async function AdminRequestsPage() {
  const { admin } = await requireAdminPage();

  const reqFlair = await getReqToAdminFlair(admin);
  let flagged: ServerMessageRow[] = [];
  if (reqFlair) {
    const { data } = await admin
      .from("server_messages")
      .select(
        "id, server_id, channel_id, author_id, body, image_url, flair_id, is_pinned, view_count, created_at",
      )
      .eq("flair_id", reqFlair.id)
      .order("created_at", { ascending: false })
      .limit(100);
    flagged = (data ?? []) as ServerMessageRow[];
  }

  const serverIds = [...new Set(flagged.map((row) => row.server_id))];
  const { data: serverData } = serverIds.length
    ? await admin.from("servers").select("id, name").in("id", serverIds)
    : { data: [] };
  const serverNames = new Map<string, string>();
  ((serverData ?? []) as Array<{ id: string; name: string }>).forEach((row) => {
    serverNames.set(row.id, row.name);
  });
  const authorProfiles = await getPublicProfilesByIds(
    admin,
    flagged.map((row) => row.author_id),
  );

  const { data: revealData } = await admin
    .from("reveal_requests")
    .select(REVEAL_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  const pendingReveals = (revealData ?? []) as RevealRequestRow[];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-neutral-400 transition hover:text-white">
          ← Admin
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          OneUCo Developer
        </p>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">ReqToAdmin queue</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
          Flagged messages ({flagged.length})
        </h2>
        {!reqFlair ? (
          <p className="rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
            The ReqToAdmin flair doesn&apos;t exist yet — run migration-0004
            (it seeds the built-in flair), or create it from the Flair
            manager as a global flair named exactly &quot;ReqToAdmin&quot;.
          </p>
        ) : flagged.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing flagged right now.</p>
        ) : (
          flagged.map((row) => {
            const author = authorProfiles.get(row.author_id);
            return (
              <article
                key={row.id}
                className="flex flex-col gap-1 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <p className="text-xs text-neutral-500">
                  {serverNames.get(row.server_id) ?? "A server"} ·{" "}
                  {new Date(row.created_at).toLocaleString([], {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · by {author ? `${author.name} (@${author.username})` : "a student"}
                </p>
                {row.body ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">
                    {row.body}
                  </p>
                ) : null}
                {row.image_url ? <p className="text-xs text-neutral-500">[photo attached]</p> : null}
                <Link
                  href={`/servers/${row.server_id}`}
                  className="mt-1 w-fit text-xs font-medium text-sky-300 transition hover:underline"
                >
                  Open in context →
                </Link>
              </article>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
          Pending reveal requests ({pendingReveals.length})
        </h2>
        {pendingReveals.length === 0 ? (
          <p className="text-sm text-neutral-500">No reveal requests waiting.</p>
        ) : (
          pendingReveals.map((request) => (
            <article
              key={request.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="text-sm text-neutral-300">
                A member asked a Maya Jwalam poster to reveal their profile.
              </p>
              <span className="shrink-0 text-xs text-neutral-500">
                {new Date(request.created_at).toLocaleString([], {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </article>
          ))
        )}
        <p className="text-xs leading-relaxed text-neutral-600">
          Posters answer reveal requests in their own Inbox — this list is
          the moderation overview only.
        </p>
      </section>
    </main>
  );
}
