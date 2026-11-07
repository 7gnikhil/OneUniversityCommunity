import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { getDiwaliMode } from "@/lib/server/diwali-settings";
import DiwaliToggle from "@/components/DiwaliToggle";

// Admin landing — owner/admin only. Middleware enforces the Admin Pass
// gate on /admin, and this page re-checks the same gate itself (like the
// subpages do via requireAdminPage) so the page never renders its
// service-role stats for a session the gate would refuse.
//
// The counts below are REAL queries against the live tables, run on the
// service-role client so RLS can never undercount an admin's own numbers.
// The queues behind them (ReqToAdmin, flairs, developer requests,
// colleges, reports) are the linked subpages; nothing here is fake data.

interface AdminStats {
  totalAccounts: number | null;
  pendingAccounts: number | null;
  pendingVerifications: number | null;
  openReports: number | null;
  pendingColleges: number | null;
  pendingDevRequests: number | null;
}

const EMPTY_STATS: AdminStats = {
  totalAccounts: null,
  pendingAccounts: null,
  pendingVerifications: null,
  openReports: null,
  pendingColleges: null,
  pendingDevRequests: null,
};

type CountTable =
  | "accounts"
  | "verifications"
  | "reports"
  | "college_codes"
  | "developer_requests";

async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: CountTable,
  column?: string,
  value?: string,
): Promise<number | null> {
  const keyColumn = table === "college_codes" ? "code" : "id";
  let query = admin.from(table).select(keyColumn, { count: "exact", head: true });
  if (column && value) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  return error ? null : count;
}

async function loadStats(): Promise<AdminStats> {
  try {
    const admin = createAdminClient();
    const [
      totalAccounts,
      pendingAccounts,
      pendingVerifications,
      openReports,
      pendingColleges,
      pendingDevRequests,
    ] = await Promise.all([
      countRows(admin, "accounts"),
      countRows(admin, "accounts", "status", "pending_verification"),
      countRows(admin, "verifications", "status", "pending"),
      countRows(admin, "reports", "status", "open"),
      countRows(admin, "college_codes", "status", "pending"),
      countRows(admin, "developer_requests", "status", "received"),
    ]);
    return {
      totalAccounts,
      pendingAccounts,
      pendingVerifications,
      openReports,
      pendingColleges,
      pendingDevRequests,
    };
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
  if (!passesAdminGate(user.email, account)) {
    redirect("/auth/admin-denied");
  }
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

  const tools: Array<{
    title: string;
    body: string;
    href: string;
    waiting: number | null;
  }> = [
    {
      title: "ReqToAdmin queue",
      body: "Messages students flag with the ReqToAdmin flair inside servers, plus the pending Maya Jwalam reveal requests overview.",
      href: "/admin/requests",
      waiting: null,
    },
    {
      title: "Flair manager",
      body: "Create, recolour and remove global and per-server flairs. ReqToAdmin is built in — recolour it, never delete it.",
      href: "/admin/flairs",
      waiting: null,
    },
    {
      title: "Developer requests inbox",
      body: "“Req to Developer” submissions from Settings → Help — set a status and the student gets an Inbox update.",
      href: "/admin/developer-requests",
      waiting: stats.pendingDevRequests,
    },
    {
      title: "College registry review",
      body: "Student-added colleges waiting at pending — approve them for everyone, or reject to remove the entry.",
      href: "/admin/colleges",
      waiting: stats.pendingColleges,
    },
    {
      title: "Reports queue",
      body: "Open reports from students, with the reported message or chirp in context. Mark actioned or dismiss.",
      href: "/admin/reports",
      waiting: stats.openReports,
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
        {tools.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 transition hover:border-neutral-600"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{item.title}</p>
              <span className="shrink-0 text-neutral-500">→</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
              {item.body}
            </p>
            {item.waiting !== null ? (
              <p className="mt-2 text-xs text-neutral-500">
                {formatCount(item.waiting)} waiting right now.
              </p>
            ) : null}
          </Link>
        ))}
      </section>

      <p className="text-xs leading-relaxed text-neutral-600">
        Joining no longer involves ID-card review, so there is no
        verification queue: the &quot;Pending verification&quot; and
        &quot;Verification queue&quot; counts above only cover legacy rows.
        Granting the admin role grants the Admin Pass — profile completion
        is skipped for those accounts, but sign-in never is.
      </p>
    </main>
  );
}
