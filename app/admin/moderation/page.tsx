import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { getPublicProfilesByIds } from "@/lib/social";
import { getMainServer } from "@/lib/servers";
import { moderateText, type ModerationVerdict } from "@/lib/moderation";
import { JwalamFlagButtons } from "../AdminQueueBits";

// Maya Jwalam auto-moderation sweep (2026-11-13). The post-time
// filter (lib/moderation, wired into sendServerMessageAction)
// already refuses the clear-cut posts. This page is the human
// half: the most recent Jwalam messages re-scored with the same
// filter, showing everything that flags or would block — borderline
// posts that landed, phone numbers shared, floods — each with a
// one-tap delete. Author identities appear HERE ONLY (admin gate);
// in the channel itself these posts stay anonymous, always.
//
// Nothing is stored for this page: it is a live scan of the last
// 150 messages, re-scored on every load.

interface JwalamRow {
  id: string;
  body: string | null;
  author_id: string;
  created_at: string;
}

interface FlaggedRow {
  row: JwalamRow;
  verdict: ModerationVerdict;
}

export default async function AdminModerationPage() {
  const { admin } = await requireAdminPage();
  const mainServer = await getMainServer(admin);

  let flagged: FlaggedRow[] = [];
  let scanned = 0;
  if (mainServer) {
    const { data } = await admin
      .from("server_messages")
      .select("id, body, author_id, created_at")
      .eq("server_id", mainServer.id)
      .order("created_at", { ascending: false })
      .limit(150);
    const rows = (data ?? []) as JwalamRow[];
    scanned = rows.length;
    flagged = rows
      .filter((row) => row.body)
      .map((row) => ({ row, verdict: moderateText(row.body ?? "") }))
      .filter((entry) => entry.verdict.action !== "allow")
      .sort((a, b) => {
        // Would-blocks first, then newest.
        const rank = (v: ModerationVerdict): number =>
          v.action === "block" ? 0 : 1;
        const byRank = rank(a.verdict) - rank(b.verdict);
        if (byRank !== 0) return byRank;
        return b.row.created_at.localeCompare(a.row.created_at);
      });
  }

  const profiles = await getPublicProfilesByIds(
    admin,
    flagged.map((entry) => entry.row.author_id),
  );

  function who(id: string): string {
    const profile = profiles.get(id);
    return profile ? `${profile.name} (@${profile.username})` : "a student";
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← Admin
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          OneUCo Developer
        </p>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Jwalam auto-moderation ({flagged.length} flagged)
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Live scan of the last {scanned} Maya Jwalam messages. The
          post-time filter already refuses abuse, threats and scam
          shapes; these are the borderline posts that landed. Author
          names show on this page only — in the channel, every post
          stays anonymous.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {flagged.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing flagged in the recent messages. The channel is
            clean.
          </p>
        ) : (
          flagged.map(({ row, verdict }) => (
            <article
              key={row.id}
              className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="flex flex-wrap gap-1.5">
                {verdict.reasons.map((reason) => (
                  <span
                    key={reason}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      verdict.action === "block"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-amber-400/10 text-amber-300"
                    }`}
                  >
                    {verdict.action === "block" ? "Would block: " : ""}
                    {reason}
                  </span>
                ))}
              </p>
              <p className="rounded-xl bg-black px-3 py-2 text-sm leading-relaxed text-neutral-200">
                “{row.body}”
              </p>
              <p className="text-xs text-neutral-500">
                Posted by {who(row.author_id)} ·{" "}
                {new Date(row.created_at).toLocaleString([], {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <JwalamFlagButtons messageId={row.id} />
            </article>
          ))
        )}
      </section>
    </main>
  );
}
