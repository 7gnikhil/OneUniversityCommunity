import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import {
  getNewsCached,
  getWeatherCached,
  resolveRegionForAccount,
} from "@/lib/news";
import NewsSection from "@/components/NewsSection";
import ChirpSidebar from "@/components/ChirpSidebar";
import { isMusicMitraEnabled } from "@/lib/server/music-settings";

// Live News — its own page (it used to be a collapsible block on
// /chirp; the hub keeps only the teaser card now). Same gate as
// /chirp: signed-in members with a finished account. The first
// paint is my region's Top stories + local weather, server-rendered
// through the same cached fetches (lib/news) as before — everything
// after that (category switches, the 5-minute refresh) happens
// inside NewsSection via the chirp actions, unchanged.
export default async function ChirpNewsPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Live News</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          the news opens up.
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

  const region = await resolveRegionForAccount(supabase, account);
  const [initialNews, initialWeather] = await Promise.all([
    getNewsCached("top", region),
    getWeatherCached(region),
  ]);

  return (
    <main data-section="chirp" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6 lg:max-w-4xl">
      <div className="flex items-center justify-between">
        <Link href="/chirp" className="text-sm text-neutral-400 transition hover:text-white">
          ← Chirp
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Chirp
        </p>
      </div>

      {/* Same sidebar layout as the hub (owner's fix, 2026-11-17):
          the section nav lives on EVERY Chirp page, so switching
          Explore ↔ Popular ↔ Campus Tweets is one tap from
          anywhere — no trip back to the hub first. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <ChirpSidebar musicOff={!(await isMusicMitraEnabled())} />
        <div className="flex min-w-0 flex-col gap-5">
          <NewsSection
            initialNews={initialNews}
            initialWeather={initialWeather}
            regionLabel={region.label}
          />
        </div>
      </div>
    </main>
  );
}
