import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  type AccountRow,
} from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { getDiwaliMode } from "@/lib/server/diwali-settings";
import DiwaliToggle from "@/components/DiwaliToggle";

// Admin landing — owner/admin only. The Admin Pass gate itself is enforced
// by middleware (accounts.role 'owner' | 'admin', or owner recognition);
// this page only renders for accounts that already passed it.
//
// The counts below are REAL queries against the live tables, run on the
// service-role client so RLS can never undercount an admin's own numbers.
// The working queues behind them — verification review, ReqToAdmin,
// flairs, developer requests — land in Slice 4 and are marked as such;
// nothing here is fake data.

interface AdminStats {
  totalAccounts: number | null;
  pendingAccounts: number | null;
  pendingVerifications: number | null;
  openReports: number | null;
}

const EMPTY_STATS: AdminStats = {
  totalAccounts: null,
  pendingAccounts: null,
  pendingVerifications: null,
  openReports: null,
};

type CountTable = "accounts" | "verifications" | "reports";

async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: CountTable,
  column?: string,
  value?: string,
): Promise<number | null> {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (column && value) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  return error ? null : count;
}

async function loadStats(): Promise<AdminStats> {
  try {
    const admin = createAdminClient();
    const [totalAccounts, pendingAccounts, pendingVerifications, openReports] =
      await Promise.all([
        countRows(admin, "accounts"),
        countRows(admin, "accounts", "status", "pending_verification"),
        countRows(admin, "verifications", "status", "pending"),
        countRows(admin, "reports", "status", "open"),
      ]);
    return { totalAccounts, pendingAccounts, pendingVerifications, openReports };
  } catch {
    // Service role unavailable — show dashes rather than wrong numbers.
    return EMPTY_STATS;
  }
}

function formatCount(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  const account: AccountRow | null = await getAccountByAuthUserId(
    supabase,
    user.id,
  );
  const profile = account
    ? await getProfileByAccountId(supabase, account.id)
    : null;
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";
  const displayName = profile?.name.trim() ? profile.name : metadataName || "Admin";
  const roleLabel = account?.role === "owner" ? "Owner" : "Admin";

  const stats = await loadStats();
  const diwaliMode = await getDiwaliMode();
  const statCards: Array<{ label: string; value: number | null; hint: string }> = [
    { label: "Total accounts", value: stats.totalAccounts, hint: "Everyone who has completed sign-up" },
    { label: "Pending verification", value: stats.pendingAccounts, hint: "Accounts waiting on ID review" },
    { label: "Verification queue", value: stats.pendingVerifications, hint: "ID submissions awaiting a decision" },
    { label: "Open reports", value: stats.openReports, hint: "Reports not yet actioned or dismissed" },
  ];

  const comingSoon: Array<{ title: string; body: string; waiting: number | null }> = [
    {
      title: "Verification review queue",
      body: "ID card photos, parsed fields, per-layer results and alternative proofs — approve or reject with a reason. Decisions are audit-logged.",
      waiting: stats.pendingVerifications,
    },
    {
      title: "ReqToAdmin queue",
      body: "Messages students flag with the ReqToAdmin flair inside servers, plus verification appeals raised the same way.",
      waiting: null,
    },
    {
      title: "Flair manager",
      body: "Create, recolour and remove server flairs. ReqToAdmin is the only built-in flair; everything else is made here.",
      waiting: null,
    },
    {
      title: "Developer requests inbox",
      body: "“Req to Developer” submissions from Settings — change requests, add-ons and bug reports — with status updates back to the student.",
      waiting: null,
    },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            OneUCo Developer
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-neutral-400 transition hover:text-white">
            View site
          </Link>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-red-900 px-3.5 py-1.5 text-sm text-red-400 transition hover:bg-red-950/40"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      {account ? (
        <section className="flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          {profile?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo_url}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-300">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            <p className="truncate text-sm text-neutral-400">
              @{account.username} · {account.oneuco_id}
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] uppercase tracking-widest text-neutral-300">
            {roleLabel}
          </span>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          Your admin account row hasn&apos;t been created yet. It&apos;s made
          automatically at the admin sign-in checkpoint — if this message
          stays, sign out and use Admin sign-in once more.
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
          >
            <p className="text-3xl font-semibold tracking-tight">
              {formatCount(card.value)}
            </p>
            <p className="mt-1 text-sm font-medium">{card.label}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{card.hint}</p>
          </div>
        ))}
      </section>

      <DiwaliToggle mode={diwaliMode} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-neutral-500">
          Queues &amp; tools
        </h2>
        {comingSoon.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{item.title}</p>
              <span className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] uppercase tracking-widest text-neutral-400">
                Coming in Slice 4
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
              {item.body}
            </p>
            {item.waiting !== null ? (
              <p className="mt-2 text-xs text-neutral-500">
                {formatCount(item.waiting)} waiting right now (counted above).
              </p>
            ) : null}
          </div>
        ))}
      </section>

      <p className="text-xs leading-relaxed text-neutral-600">
        Appointing or revoking admins, and college registry maintenance,
        also arrive with the Slice 4 queues. Granting the admin role grants
        the Admin Pass — profile completion is skipped for those accounts,
        but sign-in never is.
      </p>
    </main>
  );
}
