import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listChirps } from "@/lib/chirp";
import {
  getNews,
  getWeather,
  resolveRegionForAccount,
} from "@/lib/news";
import { accentHex } from "@/lib/validation";
import NewsSection from "@/components/NewsSection";
import ChirpFeed from "./ChirpFeed";

// Chirp — the global public feed. Identities are normal here: authors
// show their public profile — except the developer, whose author entry
// is masked server-side (developer anonymity rule; see lib/chirp.ts).
// View counts are real: opening the feed
// records one view per visible chirp (best-effort, service role).
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

  // The Live block's first paint: my region (from my college), the Top
  // stories and the local weather — all fail-soft inside lib/news.
  const region = await resolveRegionForAccount(supabase, me);
  const [initialNews, initialWeather] = await Promise.all([
    getNews("top", region),
    getWeather(region),
  ]);

  // Record views for what was just rendered (denormalised counter; the
  // feed is the view, so no per-chirp view table exists in the schema).
  if (chirps.length > 0 && admin) {
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-neutral-400 transition hover:text-white">
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Chirp
        </p>
      </div>

      <NewsSection
        initialNews={initialNews}
        initialWeather={initialWeather}
        regionLabel={region.label}
      />

      <ChirpFeed
        initialChirps={chirps}
        myAccountId={me.id}
        accentHex={accent}
      />
    </main>
  );
}
