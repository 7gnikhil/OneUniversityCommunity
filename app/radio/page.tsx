import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import RadioClient from "@/components/RadioClient";

// Music Mitra (owner's feature, 2026-11-13 as Radio; merged with
// his MusicMitra app and renamed, 2026-11-14) — a first-class
// section with its own bottom tab (it took Profile's slot; the
// profile lives on at /profile via the top-corner avatar). Free
// music through the JioSaavn unofficial API + LRCLIB synced
// lyrics for karaoke; this page is search + browse + the full
// player, while playback itself lives in the shell
// (components/RadioPlayer) so it never stops at navigation.
export default async function RadioPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Music Mitra</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first,
          then the music opens up here.
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/swipe"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Music Mitra
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Music <span className="text-amber-400">Mitra</span>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          Your music app, inside OneUco — every song free, karaoke
          with live lyrics, and it keeps playing while you swipe,
          chirp and chat.
        </p>
      </div>

      <RadioClient myAccountId={account.id} />
    </main>
  );
}
