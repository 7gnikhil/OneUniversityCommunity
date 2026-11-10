import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getPublicProfilesByIds } from "@/lib/social";
import { ReportButtons } from "../AdminQueueBits";

// Reports queue: open reports filed by students, with the reported
// message/chirp context resolved where the schema links it. Actioned /
// dismissed closes the report (the row stays for the record).
interface ReportRow {
  id: string;
  reporter_id: string;
  reported_account_id: string | null;
  server_message_id: string | null;
  chirp_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

export default async function AdminReportsPage() {
  const { admin } = await requireAdminPage();

  const { data } = await admin
    .from("reports")
    .select(
      "id, reporter_id, reported_account_id, server_message_id, chirp_id, reason, status, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (data ?? []) as ReportRow[];

  const accountIds = new Set<string>();
  reports.forEach((report) => {
    accountIds.add(report.reporter_id);
    if (report.reported_account_id) accountIds.add(report.reported_account_id);
  });
  const profiles = await getPublicProfilesByIds(admin, [...accountIds]);

  const messageIds = reports
    .map((report) => report.server_message_id)
    .filter((id): id is string => id !== null);
  const chirpIds = reports
    .map((report) => report.chirp_id)
    .filter((id): id is string => id !== null);
  const [messagesResult, chirpsResult] = await Promise.all([
    messageIds.length
      ? admin.from("server_messages").select("id, body, server_id").in("id", messageIds)
      : Promise.resolve({ data: [] as Array<{ id: string; body: string | null; server_id: string }> }),
    chirpIds.length
      ? admin.from("chirps").select("id, body").in("id", chirpIds)
      : Promise.resolve({ data: [] as Array<{ id: string; body: string | null }> }),
  ]);
  const messageById = new Map<string, { body: string | null; server_id: string }>();
  ((messagesResult.data ?? []) as Array<{ id: string; body: string | null; server_id: string }>).forEach(
    (row) => messageById.set(row.id, { body: row.body, server_id: row.server_id }),
  );
  const chirpById = new Map<string, { body: string | null }>();
  ((chirpsResult.data ?? []) as Array<{ id: string; body: string | null }>).forEach((row) =>
    chirpById.set(row.id, { body: row.body }),
  );

  function who(id: string | null): string {
    if (!id) return "—";
    const profile = profiles.get(id);
    return profile ? `${profile.name} (@${profile.username})` : "a student";
  }

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
        Reports ({reports.length} open)
      </h1>

      <section className="flex flex-col gap-3">
        {reports.length === 0 ? (
          <p className="text-sm text-neutral-500">No open reports.</p>
        ) : (
          reports.map((report) => {
            const message = report.server_message_id
              ? messageById.get(report.server_message_id)
              : undefined;
            const chirp = report.chirp_id ? chirpById.get(report.chirp_id) : undefined;
            return (
              <article
                key={report.id}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <p className="text-sm leading-relaxed text-neutral-100">{report.reason}</p>
                <p className="text-xs text-neutral-500">
                  Reported by {who(report.reporter_id)}
                  {report.reported_account_id
                    ? ` · against ${who(report.reported_account_id)}`
                    : ""}{" "}
                  ·{" "}
                  {new Date(report.created_at).toLocaleString([], {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {message ? (
                  <p className="rounded-xl bg-black px-3 py-2 text-sm text-neutral-300">
                    Server message: “{message.body ?? "[photo]"}”{" "}
                    <Link
                      href={`/servers/${message.server_id}`}
                      className="text-sky-300 transition hover:underline"
                    >
                      Open server →
                    </Link>
                  </p>
                ) : null}
                {chirp ? (
                  <p className="rounded-xl bg-black px-3 py-2 text-sm text-neutral-300">
                    Chirp: “{chirp.body ?? "[photo]"}”
                  </p>
                ) : null}
                <ReportButtons reportId={report.id} />
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
