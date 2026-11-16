import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { isMusicMitraEnabled } from "@/lib/server/music-settings";
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

  // Kill-switch (owner, 2026-11-17): when music is flipped off in
  // /admin, this section is paused — a plain notice, nothing else.
  if (!(await isMusicMitraEnabled())) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">
          Music <span className="text-amber-400">Mitra</span> is on a break
        </h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          The music section is paused right now. Everything else on
          OneUco — Fling, Chirp, Tea and Homies — is open as usual.
        </p>
        <Link
          href="/swipe"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Back to OneUco
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

      {/* Educational / unofficial-API notice (owner's call,
          2026-11-17): shown every time Music Mitra opens. This is a
          notice at the top of the section — not the footer
          attribution line he had removed on 2026-11-14. */}
      <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
          🎓 Educational purpose only
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
          Music Mitra is a student learning project. Songs are fetched
          through an <span className="text-white">unofficial API</span>{" "}
          purely for educational purposes — OneUco does not own or host
          this music, and all rights stay with the artists, labels and
          rights holders. If you love a song, support the artist on an
          official platform.
        </p>
      </div>

      <RadioClient myAccountId={account.id} />
    </main>
  );
}
