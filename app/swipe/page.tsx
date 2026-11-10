import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listDeckCandidates } from "@/lib/social";
import { getDeveloperAccountId } from "@/lib/server/owner";
import { accentHex } from "@/lib/validation";
import SwipeDeck from "./SwipeDeck";
import PageIntro from "@/components/PageIntro";

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

  const account = await getMyAccount(supabase);

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
    // Developer anonymity: the developer is never dealt as a deck
    // card — a card would expose the identity and gallery his masked
    // profile page never unlocks (see lib/social.ts).
    const developerId = await getDeveloperAccountId(admin);
    candidates = await listDeckCandidates(
      admin,
      supabase,
      account.id,
      myProfile?.intention ?? null,
      30,
      developerId ? [developerId] : [],
    );
  } catch {
    candidates = [];
  }

  return (
    <main data-section="swipe" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Swipe Deck
        </p>
      </div>
      <PageIntro section="swipe" />
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
