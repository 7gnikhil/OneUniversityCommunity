import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  getMyMatches,
  getPublicProfileByUsername,
  otherPartyId,
} from "@/lib/social";
import { getFlingProfile } from "@/lib/fling";
import { getFollowState, type FollowState } from "@/lib/follows";
import { getDeveloperAccountId } from "@/lib/server/owner";
import { INTENTIONS } from "@/lib/preferences";
import { accentHex, normaliseUsername } from "@/lib/validation";
import type { Intention } from "@/lib/types";
import FlingActions from "./FlingActions";

// A stranger's FLING profile — what tapping "View Fling profile" on a
// deck card opens (and the only profile a deck card leads to).
//
// WHAT SHOWS: exactly what the deck card already shows (hero photo,
// name, @handle, branch + intention chips, public bio) PLUS their
// Fling data (fling bio, likes, dislikes — migration 0012). Nothing
// else: the personal profile's friends-only detail (gallery grid,
// portfolio) is NOT read here, and the private declarations on the
// accounts row (college, grad year) are never read either — the
// branch chip is the PUBLIC profiles.branch the deck already shows.
//
// Developer anonymity applies as everywhere: the developer's card is
// never dealt, and a direct visit here renders the masked identity
// with no Fling data and no actions.
export default async function FlingProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = normaliseUsername(rawUsername);

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

  // My own Fling view is my settings page (Profile → Fling data).
  if (account.username === username) {
    redirect("/profile");
  }

  const profile = await getPublicProfileByUsername(supabase, username);
  if (!profile) notFound();

  const admin = createAdminClient();
  const developerId = await getDeveloperAccountId(admin).catch(() => null);
  const isDeveloper = developerId !== null && developerId === profile.accountId;

  const displayName = profile.name.trim() ? profile.name : `@${profile.username}`;

  if (isDeveloper) {
    return (
      <main
        data-section="swipe"
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6"
      >
        <Header />
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-800 text-4xl font-semibold text-neutral-400">
            D
          </span>
          <div>
            <h1 className="text-xl font-semibold">OneUCo Developer</h1>
            <p className="text-sm text-neutral-500">
              The developer stays anonymous
            </p>
          </div>
        </div>
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          🔒 The OneUCo Developer&apos;s Fling profile stays private — just
          like their profile everywhere else in OneUco.
        </p>
      </main>
    );
  }

  // Deck-card meta: the hero photo is the SAME first photo the card
  // shows (gallery's first, else the DP — the deck's own order, read
  // from profiles like lib/social does); the gallery grid itself is
  // friends-only and stays on the personal profile page.
  const { data: metaData } = await supabase
    .from("profiles")
    .select("photo_urls, intention")
    .eq("account_id", profile.accountId)
    .maybeSingle();
  const meta = (metaData ?? null) as {
    photo_urls: string[];
    intention: Intention | null;
  } | null;
  const heroPhoto = (meta?.photo_urls ?? []).find((url) => url) ?? profile.photoUrl;
  const intentionLabel = meta?.intention
    ? (INTENTIONS.find((row) => row.id === meta.intention)?.label ?? null)
    : null;

  const fling = await getFlingProfile(supabase, profile.accountId);

  // Already matched (accepted follow / mutual swipe)? Then this person
  // is not a deck stranger anymore — the deck no longer deals them
  // (Part C), and this view points at the chat instead of Fling/Pass.
  let followState: FollowState | null = null;
  try {
    followState = await getFollowState(admin, account.id, profile.accountId);
  } catch {
    followState = null;
  }
  const alreadyMatched = followState === "friends" || followState === "accepted";
  let matchId: string | null = null;
  if (alreadyMatched) {
    const matches = await getMyMatches(supabase, account.id);
    matchId =
      matches.find((match) => otherPartyId(match, account.id) === profile.accountId)
        ?.id ?? null;
  }

  const myProfile = await getProfileByAccountId(supabase, account.id);
  const accent = accentHex(myProfile?.accent_color);

  return (
    <main
      data-section="swipe"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6"
    >
      <Header />

      <div className="relative w-full overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto}
            alt={displayName}
            className="aspect-[4/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center bg-neutral-800 text-6xl font-semibold text-neutral-500">
            {displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pt-16">
          <p className="text-xl font-semibold">{displayName}</p>
          <p className="text-sm text-neutral-400">@{profile.username}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {profile.branch ? (
              <span className="rounded-full border border-neutral-600 px-2.5 py-0.5 text-xs text-neutral-200">
                {profile.branch}
              </span>
            ) : null}
            {intentionLabel ? (
              <span className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs text-neutral-400">
                {intentionLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {profile.bio ? (
        <p className="text-sm leading-relaxed text-neutral-300">{profile.bio}</p>
      ) : null}

      {/* Fling data — the whole point of this page. */}
      <section className="flex flex-col gap-4">
        <FlingBlock label="Fling bio" value={fling.bio} emptyText="No Fling bio yet." />
        <FlingBlock label="Likes" value={fling.likes} emptyText="Hasn't listed any likes yet." />
        <FlingBlock
          label="Dislikes"
          value={fling.dislikes}
          emptyText="Hasn't listed any dislikes yet."
        />
      </section>

      {alreadyMatched ? (
        <div className="w-full rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-center shadow-xl">
          <p className="text-base font-semibold">You&apos;re already matched 🎉</p>
          <p className="mt-1 text-sm text-neutral-400">
            You and {displayName} are already connected — your chat lives in
            Homies.
          </p>
          <div className="mt-3 flex items-center justify-center">
            <Link
              href={matchId ? `/friends/${matchId}` : "/friends"}
              className="rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              Message them
            </Link>
          </div>
        </div>
      ) : (
        <FlingActions
          candidateId={profile.accountId}
          displayName={displayName}
          accentHex={accent}
        />
      )}
    </main>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/swipe"
        className="text-sm text-neutral-400 transition hover:text-white"
      >
        ← Fling
      </Link>
      <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
        Fling profile
      </p>
    </div>
  );
}

function FlingBlock({
  label,
  value,
  emptyText,
}: {
  label: string;
  value: string | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
        {label}
      </h2>
      {value ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
          {value}
        </p>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
          {emptyText}
        </p>
      )}
    </div>
  );
}
