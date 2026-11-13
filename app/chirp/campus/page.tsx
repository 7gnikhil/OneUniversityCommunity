import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listChirps } from "@/lib/chirp";
import { listServersForUser, type ServerListEntry } from "@/lib/servers";
import { accentHex } from "@/lib/validation";
import PageIntro from "@/components/PageIntro";
import ChirpFeed from "../ChirpFeed";

// Campus Tweets — the full chirp feed on its own page (it used to
// render inline under the composer on /chirp; the hub keeps the
// composer + a preview card now). This is the feed's ONLY full
// home: ChirpFeed is mounted whole here, exactly as /chirp used to
// mount it — moved, not duplicated. Identities are normal here:
// authors show their public profile — except the developer, whose
// author entry is masked server-side (developer anonymity rule;
// see lib/chirp.ts). View counts are real: opening the feed records
// one view per visible chirp (best-effort, service role).
export default async function ChirpCampusPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Campus Tweets</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          the feed opens up.
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

  // Service role, shared by the feed's developer masking and the view
  // counting below. Fail-soft: without it the feed still renders (the
  // masking resolves to a no-op) and views simply go unrecorded.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  // The feed and my own profile (for the accent colour) are independent
  // reads — fetch them together.
  const [chirps, myProfile] = await Promise.all([
    listChirps(supabase, me.id, 50, admin),
    getProfileByAccountId(supabase, me.id),
  ]);
  const accent = accentHex(myProfile?.accent_color);

  // Campus communities (owner's ask, 2026-11-13): students can find
  // and start campus communities from right here in Chirp, and jump
  // into their chats. The communities themselves are Tea servers —
  // the same list Tea shows, minus the main channel (Maya Jwalam
  // has its own front door) — creation happens in Tea, exactly as
  // the Chirp sidebar's "Start a community" promises. Fail-soft:
  // no admin client or a failed read renders the feed alone.
  let communities: ServerListEntry[] = [];
  if (admin) {
    try {
      const entries = await listServersForUser(admin, me.id);
      communities = entries
        .filter((entry) => !entry.server.is_main_channel)
        .slice(0, 6);
    } catch {
      communities = [];
    }
  }

  // Record views for what was just rendered (denormalised counter; the
  // feed is the view, so no per-chirp view table exists in the schema).
  // ONE batched RPC increments every rendered chirp (migration 0009);
  // the per-row loop survives only as a fallback for the window
  // before that migration is applied.
  if (chirps.length > 0 && admin) {
    try {
      const { error } = await admin.rpc("increment_chirp_views", {
        ids: chirps.map((chirp) => chirp.id),
      });
      if (error) throw error;
    } catch {
      try {
        await Promise.all(
          chirps.map((chirp) =>
            admin
              .from("chirps")
              .update({ view_count: chirp.viewCount + 1 })
              .eq("id", chirp.id),
          ),
        );
      } catch {
        // View counting must never break the feed.
      }
    }
  }

  return (
    <main data-section="chirp" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/chirp" className="text-sm text-neutral-400 transition hover:text-white">
          ← Chirp
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Chirp
        </p>
      </div>

      <PageIntro section="chirp-campus" />

      <CampusCommunities entries={communities} />

      <ChirpFeed
        initialChirps={chirps}
        myAccountId={me.id}
        accentHex={accent}
        myName={myProfile?.name}
        myPhotoUrl={myProfile?.photo_url}
      />
    </main>
  );
}

// CAMPUS COMMUNITIES — student communities surfaced inside Chirp
// (owner's ask, 2026-11-13: "in campus tweets users can create
// their own campus communities in chirp and chat there"). Each row
// opens the community's Tea chat; the create button goes to Tea,
// where the community is actually made — the same promise the
// Chirp sidebar's "Start a community" makes.
function CampusCommunities({ entries }: { entries: ServerListEntry[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          Campus communities
        </h2>
        <Link
          href="/servers"
          className="ml-auto shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-neutral-200"
        >
          ＋ Create
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm leading-relaxed text-neutral-400">
          No campus communities yet. Start the first one for your
          campus, club or branch — it takes a minute, and your people
          can chat there right away.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-neutral-900">
          {entries.map(({ server, membership, memberCount }) => (
            <Link
              key={server.id}
              href={`/servers/${server.id}`}
              className="group flex items-center gap-3 py-2.5 transition first:pt-0 last:pb-0"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-base font-bold text-neutral-200 ring-1 ring-white/10">
                {server.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-neutral-100">
                  {server.name}
                </span>
                <span className="truncate text-xs text-neutral-500">
                  {server.description?.trim()
                    ? server.description
                    : "A student community"}
                  {" · "}
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                  {membership ? " · Joined" : ""}
                </span>
              </span>
              <span className="ml-auto shrink-0 text-xs font-medium text-neutral-400 transition group-hover:text-white">
                Chat →
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/servers"
        className="text-xs font-medium text-neutral-500 transition hover:text-neutral-300"
      >
        See all communities in Tea →
      </Link>
    </section>
  );
}
