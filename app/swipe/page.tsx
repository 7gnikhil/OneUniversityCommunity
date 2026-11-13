import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { listDeckCandidates } from "@/lib/social";
import { getDeveloperAccountId } from "@/lib/server/owner";
import { accentHex } from "@/lib/validation";
import SwipeDeck from "./SwipeDeck";
import PageIntro from "@/components/PageIntro";
import Avatar from "@/components/Avatar";
import { quoteOfTheDay } from "@/lib/loading-quotes";
import { istMidnightUtc } from "@/lib/daily";
import {
  ratingsForAccounts,
  weeklyLeaders,
  type FlingRating,
  type WeeklyLeader,
} from "@/lib/fling-rating";

// Fling — the app's #1 priority surface (Tinder-style, verified
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
        <h1 className="text-xl font-semibold">Fling</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          Fling opens up here.
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

  // ── Starting-page features (2026-11-11) ─────────────────────────
  // All fail-soft: any failure renders the deck alone, never an
  // error page. The quote is pure code; the rest are small reads.
  const quote = quoteOfTheDay();

  // "New today" pulse: joins, chirps and matches since IST midnight.
  let pulse: { joined: number; chirps: number; matches: number } | null =
    null;
  try {
    const admin = createAdminClient();
    const since = istMidnightUtc().toISOString();
    const countSince = async (table: string): Promise<number> => {
      const { count } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      return count ?? 0;
    };
    pulse = {
      joined: await countSince("accounts"),
      chirps: await countSince("chirps"),
      matches: await countSince("matches"),
    };
  } catch {
    pulse = null;
  }

  // Fling ratings for the dealt candidates — DERIVED from likes
  // received THIS WEEK (last 7 days; lib/fling-rating). One
  // grouped read over the candidates' received swipes.
  let deckRatings: Record<string, FlingRating> = {};
  let leaders: WeeklyLeader[] = [];
  if (candidates.length > 0) {
    try {
      const admin = createAdminClient();
      deckRatings = await ratingsForAccounts(
        admin,
        candidates.map((row) => row.profile.accountId),
        7,
      );
    } catch {
      deckRatings = {};
    }
  }
  // Top this week — the weekly student board (real students only;
  // developer + seed accounts excluded inside the helper, the
  // developer additionally by id here).
  try {
    const admin = createAdminClient();
    const developerId = await getDeveloperAccountId(admin);
    leaders = await weeklyLeaders(admin, 5, developerId ? [developerId] : []);
  } catch {
    leaders = [];
  }

  const pulseParts: string[] = [];
  if (pulse) {
    if (pulse.joined > 0)
      pulseParts.push(
        `${pulse.joined} joined`,
      );
    if (pulse.chirps > 0) pulseParts.push(`${pulse.chirps} chirps`);
    if (pulse.matches > 0)
      pulseParts.push(`${pulse.matches} new match${pulse.matches === 1 ? "" : "es"}`);
  }

  return (
    <main data-section="swipe" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/swipe"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Fling
        </p>
      </div>
      <PageIntro section="swipe" />

      {/* Quote of the day — the loader's quote, on the front page. */}
      <p className="text-center text-[13px] italic leading-relaxed text-neutral-400">
        &ldquo;{quote}&rdquo;
      </p>

      {/* New-today pulse: quiet proof the community is alive. */}
      {pulseParts.length > 0 ? (
        <p className="text-center text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          Today on OneUco · {pulseParts.join(" · ")}
        </p>
      ) : null}

      {leaders.length > 0 ? (
        <section className="w-full max-w-sm self-center rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
            Top this week
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {leaders.map((leader, i) => {
              const display = leader.name.trim()
                ? leader.name
                : `@${leader.username}`;
              return (
                <div key={leader.accountId} className="flex items-center gap-2.5">
                  <span className="w-4 shrink-0 text-xs font-semibold text-neutral-500">
                    {i + 1}
                  </span>
                  <Avatar
                    name={display}
                    photoUrl={leader.photoUrl}
                    sizeClass="h-7 w-7"
                    textClass="text-[10px]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                    {display}
                    {leader.name.trim() ? (
                      <span className="text-neutral-500">
                        {" "}
                        @{leader.username}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    ♥ {leader.likes}
                  </span>
                  <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    ★ {leader.rating.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <SwipeDeck
        // Remount when the dealt deck changes (e.g. after Start Again
        // resets passes and the server re-deals) — the deck keeps its
        // working queue in client state, keyed to the candidate set.
        key={candidates.map((row) => row.profile.accountId).join(",")}
        candidates={candidates}
        accentHex={accentHex(myProfile?.accent_color)}
        ratings={deckRatings}
      />
    </main>
  );
}
