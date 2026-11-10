import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import {
  listAccountsWithPresence,
  type AccountPresenceEntry,
} from "@/lib/presence";
import type { AccountStatus } from "@/lib/types";
import MarkVerifiedButton from "./MarkVerifiedButton";

// Admin — every account on OneUco, with live presence.
//
// This is the developer's own moderation view (owner-email gate via
// requireAdminPage), so emails and self-declared colleges ARE shown
// here — they never appear on any student-facing surface. Rows are
// stacked cards, not a table, so the list stays usable on a phone:
// nothing can overflow horizontally.
//
// ?filter=pending narrows to the legacy state the admin home counts as
// "Pending verification": accounts stuck at pending_verification from
// the old ID-review era. Joining no longer uses ID review, so those
// accounts are simply un-stuck with "Mark verified".

const STATUS_STYLES: Record<AccountStatus, string> = {
  verified: "border-emerald-900 bg-emerald-950/40 text-emerald-300",
  pending_verification: "border-amber-900 bg-amber-950/40 text-amber-300",
  rejected: "border-red-900 bg-red-950/40 text-red-300",
  suspended: "border-red-900 bg-red-950/40 text-red-300",
};

const STATUS_LABELS: Record<AccountStatus, string> = {
  verified: "Verified",
  pending_verification: "Pending verification",
  rejected: "Rejected",
  suspended: "Suspended",
};

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLastSeen(entry: AccountPresenceEntry): string {
  if (!entry.presence) return "Never opened the app";
  if (entry.online) return "Online now";
  const then = new Date(entry.presence.last_seen_at).getTime();
  if (Number.isNaN(then)) return "Last seen recently";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Last seen yesterday";
  if (days < 30) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(entry.presence.last_seen_at).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  })}`;
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { admin } = await requireAdminPage();
  const { filter } = await searchParams;
  const pendingOnly = filter === "pending";

  const all = await listAccountsWithPresence(admin);
  const onlineCount = all.filter((entry) => entry.online).length;
  const pendingCount = all.filter(
    (entry) => entry.status === "pending_verification",
  ).length;
  const entries = pendingOnly
    ? all.filter((entry) => entry.status === "pending_verification")
    : all;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {all.length} account{all.length === 1 ? "" : "s"} · {onlineCount}{" "}
            online now · {pendingCount} pending verification
          </p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 text-sm text-neutral-400 transition hover:text-white"
        >
          ← Admin
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Account filters">
        <Link
          href="/admin/accounts"
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
            pendingOnly
              ? "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
              : "bg-white text-black"
          }`}
        >
          All accounts
        </Link>
        <Link
          href="/admin/accounts?filter=pending"
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
            pendingOnly
              ? "bg-white text-black"
              : "border border-neutral-700 text-neutral-300 hover:border-neutral-500"
          }`}
        >
          Pending verification ({pendingCount})
        </Link>
      </nav>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
          {pendingOnly
            ? "No accounts are stuck in pending verification — the old ID-review queue is clear."
            : "No accounts yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <AccountCard key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-neutral-600">
        Presence comes from the in-app heartbeat (migration 0007): a
        student counts as online when their last beat landed within 3
        minutes. Students who turned off &quot;Show my online
        status&quot; still heartbeat — that switch shapes what OTHER
        STUDENTS see, never this moderation view.
      </p>
    </main>
  );
}

function AccountCard({ entry }: { entry: AccountPresenceEntry }) {
  const displayName = entry.name.trim() ? entry.name : `@${entry.username}`;
  return (
    <li className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          {entry.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.photoUrl}
              alt=""
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-400">
              {displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {entry.online ? (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-neutral-950" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-sm font-medium">{displayName}</p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[entry.status]}`}
            >
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <p className="mt-0.5 break-words text-xs text-neutral-400">
            @{entry.username} · OneUco ID {entry.oneucoId}
          </p>
          <p className="break-all text-xs text-neutral-400">{entry.email}</p>
          {entry.collegeName ? (
            <p className="mt-0.5 break-words text-xs text-neutral-500">
              {entry.collegeName} (self-declared)
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-neutral-500">
            Joined {formatJoined(entry.createdAt)} · {formatLastSeen(entry)}
          </p>
        </div>

        {entry.status === "pending_verification" ? (
          <MarkVerifiedButton accountId={entry.id} />
        ) : null}
      </div>
    </li>
  );
}
