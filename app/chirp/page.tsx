import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { listChirps } from "@/lib/chirp";
import { accentHex } from "@/lib/validation";
import ChirpFeed from "./ChirpFeed";

// Chirp — the global public feed. Identities are normal here: authors
// show their public profile. View counts are real: opening the feed
// records one view per visible chirp (best-effort, service role).
export default async function ChirpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

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

  // The feed and my own profile (for the accent colour) are independent
  // reads — fetch them together.
  const [chirps, myProfile] = await Promise.all([
    listChirps(supabase, me.id, 50),
    getProfileByAccountId(supabase, me.id),
  ]);
  const accent = accentHex(myProfile?.accent_color);

  // Record views for what was just rendered (denormalised counter; the
  // feed is the view, so no per-chirp view table exists in the schema).
  if (chirps.length > 0) {
    try {
      const admin = createAdminClient();
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

      <ChirpFeed
        initialChirps={chirps}
        myAccountId={me.id}
        accentHex={accent}
      />
    </main>
  );
}
