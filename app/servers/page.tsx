import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  ensureMainServer,
  getServerUnreadCounts,
  listServersForUser,
  type ServerListEntry,
} from "@/lib/servers";
import { accentHex } from "@/lib/validation";
import CreateServerForm from "./CreateServerForm";
import PageIntro from "@/components/PageIntro";

// Servers — Maya Jwalam pinned first (the main channel, flagged in data
// via servers.is_main_channel, never by name), then my servers and the
// public directory. Per-server unread bubbles come from
// server_members.last_read_at (lib/servers getServerUnreadCounts).
export default async function ServersPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Tea</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          your teas show up here.
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

  const myProfilePromise = getProfileByAccountId(supabase, me.id);
  // The profile fetch is awaited below on every path; this side handler
  // just keeps an early rejection from surfacing as unhandled while the
  // admin block runs. Awaiting the original promise still rethrows.
  myProfilePromise.catch(() => undefined);

  let entries: ServerListEntry[] = [];
  let unread: Record<string, number> = {};
  let adminReady = true;
  try {
    const admin = createAdminClient();
    await ensureMainServer(admin);
    // The list and the unread counts are independent once the main
    // server exists — run them together, but keep the original
    // assignment order: if the counts fail after the list succeeded,
    // the page still renders the list (with the notice below).
    const unreadPromise = getServerUnreadCounts(admin, me.id);
    unreadPromise.catch(() => undefined);
    entries = await listServersForUser(admin, me.id);
    unread = await unreadPromise;
  } catch {
    adminReady = false;
  }
  const myProfile = await myProfilePromise;
  const accent = accentHex(myProfile?.accent_color);

  return (
    <main data-section="servers" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/home" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Tea
        </p>
      </div>

      <PageIntro section="servers" />

      {!adminReady ? (
        <p className="rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          Tea isn&apos;t fully configured yet — please try again shortly.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <ServerRow
            key={entry.server.id}
            entry={entry}
            unreadCount={unread[entry.server.id] ?? 0}
            accent={accent}
          />
        ))}
      </ul>
      {entries.length === 0 && adminReady ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No teas yet — brew the first one below.
        </p>
      ) : null}

      <CreateServerForm myAccountId={me.id} />
    </main>
  );
}

function ServerRow({
  entry,
  unreadCount,
  accent,
}: {
  entry: ServerListEntry;
  unreadCount: number;
  accent: string;
}) {
  const { server, membership, memberCount } = entry;
  const subtitle = server.is_main_channel
    ? "The main channel · anonymous"
    : server.type === "public"
      ? `Public · ${memberCount} member${memberCount === 1 ? "" : "s"}`
      : `Private · ${memberCount} member${memberCount === 1 ? "" : "s"}`;
  return (
    <li>
      <Link
        href={`/servers/${server.id}`}
        className="flex items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3 transition hover:border-neutral-600"
      >
        {server.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={server.icon_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-base font-semibold text-neutral-300">
            {server.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{server.name}</span>
            {server.is_main_channel ? (
              <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
                Main
              </span>
            ) : null}
            {!membership && !server.is_main_channel ? (
              <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neutral-400">
                Not joined
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {subtitle}
          </span>
        </span>
        {unreadCount > 0 ? (
          <span
            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
