import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listChirps, type ChirpView } from "@/lib/chirp";
import { accentHex } from "@/lib/validation";
import Avatar from "@/components/Avatar";
import PageIntro from "@/components/PageIntro";
import ChirpSidebar from "@/components/ChirpSidebar";
import ChirpFeed from "./ChirpFeed";

// Chirp — the hub, which is EXPLORE (owner's reshuffle,
// 2026-11-13): the main page carries the composer and the full
// all-college feed inline. Identities are normal here: authors
// show their public profile — except the developer, whose author
// entry is masked server-side (developer anonymity rule; see
// lib/chirp.ts).
//
// The sidebar (components/ChirpSidebar) carries the rest:
//   POPULAR          → /chirp/news   (Live News lives there now —
//                                     the news card that used to
//                                     sit on this page is gone)
//   START A COMMUNITY → /servers     (Tea — communities are made
//                                     and run there)
//   CAMPUS TWEETS    → /chirp/campus (the feed again, headed by
//                                     the Campus communities list)
// View counts are NOT recorded here — /chirp/campus records them,
// as it always did.
export default async function ChirpPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Chirp</h1>
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

  // Service role, used for the feed's developer masking. Fail-
  // soft: without it the feed still renders (the masking resolves
  // to a no-op).
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  // Independent reads, fetched together: my profile (composer
  // accent) and the feed's chirps — one read of 30: the Explore
  // timeline renders them and the Trending card ranks the same
  // set by engagement. News/weather are NOT fetched here any
  // more: news lives inside Popular now (2026-11-13), which also
  // takes the RSS cost off this page.
  const [myProfile, recentChirps] = await Promise.all([
    getProfileByAccountId(supabase, me.id),
    listChirps(supabase, me.id, 30, admin),
  ]);
  const trendingChirps = [...recentChirps]
    .filter((chirp) => chirp.likeCount + chirp.commentCount > 0)
    .sort(
      (a, b) =>
        b.likeCount + 2 * b.commentCount - (a.likeCount + 2 * a.commentCount),
    )
    .slice(0, 3);
  const accent = accentHex(myProfile?.accent_color);

  return (
    <main data-section="chirp" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6 lg:max-w-4xl">
      <div className="flex items-center justify-between">
        <Link href="/swipe" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Chirp
        </p>
      </div>

      {/* Sidebar layout (2026-11-13, the Reddit pattern): Explore,
          Popular (news) and Start a community sit beside the hub on
          wide screens and in a slide-over drawer on phones — see
          components/ChirpSidebar. The hub's own cards stay in the
          content column, unchanged. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <ChirpSidebar />

        <div className="flex min-w-0 flex-col gap-5">
      {/* EXPLORE (owner's reshuffle, 2026-11-13): the main Chirp
          page IS Explore — composer + the full feed, right here.
          News no longer sits on this page at all; it lives inside
          Popular (/chirp/news), where the sidebar points. */}
      <PageIntro section="chirp" />

      <ChirpFeed
        initialChirps={recentChirps}
        myAccountId={me.id}
        accentHex={accent}
        myName={myProfile?.name}
        myPhotoUrl={myProfile?.photo_url}
      />

      {trendingChirps.length > 0 ? (
        <TrendingCard chirps={trendingChirps} />
      ) : null}
        </div>
      </div>
    </main>
  );
}

// The doorway chevron in its bordered circle, pointing right:
// this card opens a page. (Kept for the Trending card — the two
// doorway cards that used it retired in the 2026-11-13 reshuffle.)
function DoorwayChevron() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-700 transition group-hover:border-neutral-500">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 -rotate-90 text-neutral-400"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

// Trending on Chirp (2026-11-12, owner's pick: "add features to
// Chirp (trending, poll)"). The hub's recent-30 read, ranked by
// engagement — likes + comments weighted double — top 3, rendered
// in the Campus Tweets card's idiom and opening the same feed.
// Renders only when at least one recent chirp has any engagement,
// so a quiet day shows no empty card.
function TrendingCard({ chirps }: { chirps: ChirpView[] }) {
  return (
    <Link
      href="/chirp/campus"
      className="group flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3 transition hover:border-neutral-600"
      aria-label="Open trending chirps"
    >
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          Trending
        </span>
        <span className="ml-auto">
          <DoorwayChevron />
        </span>
      </span>
      <span className="flex flex-col gap-2.5">
        {chirps.map((chirp) => {
          const firstLine =
            chirp.body
              ?.split("\n")
              .find((line) => line.trim().length > 0)
              ?.trim() ??
            (chirp.imageUrl ? "📷 Photo" : "");
          return (
            <span key={chirp.id} className="flex min-w-0 items-center gap-2.5">
              <Avatar
                name={chirp.author?.name ?? "?"}
                photoUrl={chirp.author?.photoUrl ?? null}
                developer={chirp.author?.developer}
                sizeClass="h-7 w-7"
                textClass="text-[10px]"
              />
              <span className="shrink-0 text-xs font-medium text-neutral-200">
                {chirp.author?.name ?? "A student"}
              </span>
              {firstLine ? (
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">
                  {firstLine}
                </span>
              ) : null}
              <span className="shrink-0 text-[11px] text-neutral-500">
                ♥ {chirp.likeCount} · 💬 {chirp.commentCount}
              </span>
            </span>
          );
        })}
      </span>
    </Link>
  );
}
