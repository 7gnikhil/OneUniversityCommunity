import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getPublicProfilesByIds } from "@/lib/social";
import type { DeveloperRequestRow } from "@/app/help/actions";
import { DevRequestStatusSelect } from "../AdminQueueBits";

// Developer requests inbox: "Req to Developer" submissions from
// Settings → Help. Changing a status delivers an Inbox notice to the
// student (see app/admin/actions.ts) and their Help page re-reads the
// new status from the row itself.
const CATEGORY_LABELS: Record<DeveloperRequestRow["category"], string> = {
  change: "Change",
  addon: "Add-on",
  bug: "Bug",
  other: "Other",
};

export default async function AdminDeveloperRequestsPage() {
  const { admin } = await requireAdminPage();

  const { data } = await admin
    .from("developer_requests")
    .select("id, account_id, category, title, body, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const requests = (data ?? []) as DeveloperRequestRow[];
  const authors = await getPublicProfilesByIds(
    admin,
    requests.map((request) => request.account_id),
  );

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

      <h1 className="text-xl font-semibold tracking-tight">
        Developer requests ({requests.length})
      </h1>

      <section className="flex flex-col gap-3">
        {requests.length === 0 ? (
          <p className="text-sm text-neutral-500">No requests yet.</p>
        ) : (
          requests.map((request) => {
            const author = authors.get(request.account_id);
            return (
              <article
                key={request.id}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium">{request.title}</p>
                  <DevRequestStatusSelect
                    requestId={request.id}
                    current={request.status}
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  {CATEGORY_LABELS[request.category]} ·{" "}
                  {author ? `${author.name} (@${author.username})` : "a student"} ·{" "}
                  {new Date(request.created_at).toLocaleString([], {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">
                  {request.body}
                </p>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
