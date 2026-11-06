import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { listDeckCandidates } from "@/lib/social";
import { accentHex } from "@/lib/validation";
import SwipeDeck from "./SwipeDeck";

// Swipe Deck — the app's #1 priority surface (Tinder-style, verified
// students only; middleware holds everyone else at /verify).
//
// The deck is assembled server-side from PUBLIC data only (see
// lib/social.ts): verified students from the public_profiles view, minus
// my own swipes and anyone in a block relation with me. Year, college,
// hall-ticket number and preferences never leave the server — they are
// not even selected.
export default async function SwipePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Swipe Deck</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          the deck opens up here.
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

  const myProfile = await getProfileByAccountId(supabase, account.id);

  let candidates: Awaited<ReturnType<typeof listDeckCandidates>> = [];
  try {
    const admin = createAdminClient();
    candidates = await listDeckCandidates(
      admin,
      supabase,
      account.id,
      myProfile?.intention ?? null,
      30,
    );
  } catch {
    candidates = [];
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Swipe Deck
        </p>
      </div>
      <SwipeDeck
        // Remount when the dealt deck changes (e.g. after Start Again
        // resets passes and the server re-deals) — the deck keeps its
        // working queue in client state, keyed to the candidate set.
        key={candidates.map((row) => row.profile.accountId).join(",")}
        candidates={candidates}
        accentHex={accentHex(myProfile?.accent_color)}
      />
    </main>
  );
}
