import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getPublicProfilesByIds } from "@/lib/social";
import { CollegeReviewButtons } from "../AdminQueueBits";

// College registry review: student-added colleges sit at status
// 'pending' (selectable only by their adder) until an admin approves
// them here. Reject removes the row — migration-0002's check constraint
// has no 'rejected' status, and accounts.college_code is ON DELETE SET
// NULL, so the student's declared college name text survives on their
// private account row.
interface PendingCollege {
  code: string;
  college_name: string;
  city: string | null;
  added_by: string | null;
  created_at: string;
}

export default async function AdminCollegesPage() {
  const { admin } = await requireAdminPage();

  const { data } = await admin
    .from("college_codes")
    .select("code, college_name, city, added_by, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const colleges = (data ?? []) as PendingCollege[];
  const adders = await getPublicProfilesByIds(
    admin,
    colleges
      .map((college) => college.added_by)
      .filter((id): id is string => id !== null),
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
        College registry review ({colleges.length} pending)
      </h1>

      <section className="flex flex-col gap-3">
        {colleges.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No student-added colleges waiting for review.
          </p>
        ) : (
          colleges.map((college) => {
            const adder = college.added_by ? adders.get(college.added_by) : undefined;
            return (
              <article
                key={college.code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{college.college_name}</p>
                  <p className="text-xs text-neutral-500">
                    Code {college.code}
                    {college.city ? ` · ${college.city}` : ""} · added by{" "}
                    {adder ? `${adder.name} (@${adder.username})` : "a student"}
                  </p>
                </div>
                <CollegeReviewButtons code={college.code} />
              </article>
            );
          })
        )}
      </section>

      <p className="text-xs leading-relaxed text-neutral-600">
        Approving makes the college selectable by everyone. Rejecting
        removes the registry row; students who picked it keep their
        self-declared college name on their private account.
      </p>
    </main>
  );
}
