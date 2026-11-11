import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listChirps, type ChirpView } from "@/lib/chirp";
import {
  getNewsCached,
  getWeatherCached,
  resolveRegionForAccount,
  type NewsItem,
  type WeatherView,
} from "@/lib/news";
import { accentHex } from "@/lib/validation";
import Avatar from "@/components/Avatar";
import PageIntro from "@/components/PageIntro";
import ChirpFeed from "./ChirpFeed";

// Chirp — the hub. Identities are normal here: authors show their
// public profile — except the developer, whose author entry is
// masked server-side (developer anonymity rule; see lib/chirp.ts).
//
// The page itself now carries only the intro, the composer and two
// DOORWAY cards — the content lives on its own pages (owner's ask):
//   LIVE NEWS      → /chirp/news   (the full news experience)
//   CAMPUS TWEETS  → /chirp/campus (the full chirp feed)
// Nothing renders in two places: the stories list exists only in
// components/NewsSection (mounted by /chirp/news) and the timeline
// only in ChirpFeed (mounted whole by /chirp/campus).
//
// The composer is the one exception to "moved": ChirpFeed is a
// single component (composer form + timeline in one root) and its
// file is off-limits while the photo-upload fix is in flight, so
// the hub mounts it composer-only — the .composer-only scope in
// globals.css suppresses every child of the feed root except the
// form and its error line. Posting from here works exactly as
// before; the posted chirp appears on the Campus Tweets page (and
// in this page's preview card on the next load). View counts are
// NOT recorded here — previews are teasers; opening the feed on
// /chirp/campus is what records views, as it always did.
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

  // Service role, used for the preview's developer masking. Fail-
  // soft: without it the preview still renders (the masking resolves
  // to a no-op).
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  // Independent reads, fetched together: my profile (composer
  // accent), the Live News card's region/news/weather (the same
  // cached fetches the news page uses), and the Campus Tweets
  // preview (the latest 3 chirps, masked by listChirps as usual).
  const [myProfile, previewChirps] = await Promise.all([
    getProfileByAccountId(supabase, me.id),
    listChirps(supabase, me.id, 3, admin),
  ]);
  const accent = accentHex(myProfile?.accent_color);

  const region = await resolveRegionForAccount(supabase, me);
  const [topNews, weather] = await Promise.all([
    getNewsCached("top", region),
    getWeatherCached(region),
  ]);

  return (
    <main data-section="chirp" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/swipe" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Chirp
        </p>
      </div>

      <PageIntro section="chirp" />

      {/* The composer, mounted composer-only (see the header
          comment): ChirpFeed with an empty timeline, scoped so only
          the form + its error line show. */}
      <div className="composer-only">
        <ChirpFeed
          initialChirps={[]}
          myAccountId={me.id}
          accentHex={accent}
        />
      </div>

      <LiveNewsCard topItem={topNews[0] ?? null} weather={weather} />

      <CampusTweetsCard chirps={previewChirps} />
    </main>
  );
}

// The doorway chevron in its bordered circle (the old news bar's
// affordance), pointing right: this card opens a page.
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

// LIVE NEWS doorway — the slim bar from the block era, as a teaser:
// LIVE dot, the weather chip, and the top headline as a one-line
// preview (from the same cached Top fetch the news page renders).
// The whole card taps through to /chirp/news.
function LiveNewsCard({
  topItem,
  weather,
}: {
  topItem: NewsItem | null;
  weather: WeatherView | null;
}) {
  return (
    <Link
      href="/chirp/news"
      className="group flex items-center gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3 transition hover:border-neutral-600"
      aria-label="Open Live News"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
            Live News
          </span>
          {weather ? (
            <span className="truncate text-xs text-neutral-400">
              {weather.placeLabel} · {weather.temperatureC}°C ·{" "}
              {weather.conditionLabel}
            </span>
          ) : null}
        </span>
        {topItem ? (
          <span className="truncate text-xs text-neutral-400">
            {topItem.title}
          </span>
        ) : null}
      </span>
      <span className="ml-auto">
        <DoorwayChevron />
      </span>
    </Link>
  );
}

// CAMPUS TWEETS doorway — the latest few chirps as a compact
// preview (author + first line). The whole card taps through to
// /chirp/campus, where the full feed lives.
function CampusTweetsCard({ chirps }: { chirps: ChirpView[] }) {
  return (
    <Link
      href="/chirp/campus"
      className="group flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3 transition hover:border-neutral-600"
      aria-label="Open Campus Tweets"
    >
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-100">
          Campus Tweets
        </span>
        <span className="ml-auto">
          <DoorwayChevron />
        </span>
      </span>
      {chirps.length === 0 ? (
        <span className="text-xs text-neutral-500">
          No chirps yet — be the first to post one.
        </span>
      ) : (
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
                  <span className="min-w-0 truncate text-xs text-neutral-400">
                    {firstLine}
                  </span>
                ) : null}
              </span>
            );
          })}
        </span>
      )}
    </Link>
  );
}
