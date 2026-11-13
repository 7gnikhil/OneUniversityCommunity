import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import RadioClient from "@/components/RadioClient";

// Radio (owner's feature, 2026-11-13) — a first-class section with
// its own bottom tab (it took Profile's slot; the profile lives on
// at /profile via the top-corner avatar). Free music through the
// JioSaavn unofficial API; this page is search + browse + the full
// player card, while playback itself lives in the shell
// (components/RadioPlayer) so it never stops at navigation.
export default async function RadioPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Radio</h1>
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
          Radio
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          OneUco <span className="text-amber-400">Radio</span>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          Every song, free — press play and keep the app in your ears
          while you swipe, chirp and chat.
        </p>
      </div>

      <RadioClient />
    </main>
  );
}
