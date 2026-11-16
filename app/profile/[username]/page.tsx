import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getPublicProfileByUsername } from "@/lib/social";
import { getProfileByAccountId } from "@/lib/profile";
import { getFollowState, getFollowCounts, type FollowState } from "@/lib/follows";
import { countChirpsByAuthor, listChirpsByAuthor, type ChirpView } from "@/lib/chirp";
import { INTENTIONS, normalisePortfolio, type Portfolio } from "@/lib/preferences";
import type { FollowUiState } from "@/app/follow/actions";
import FollowButton from "@/components/FollowButton";
import { listCoversForProfile } from "@/lib/covers";
import ProfileCovers from "@/components/ProfileCovers";
import Avatar from "@/components/Avatar";
import ProfileTabs from "@/components/ProfileTabs";
import ProfilePosts from "@/components/ProfilePosts";
import { accentHex, normaliseUsername } from "@/lib/validation";
import { isOwnerEmail } from "@/lib/server/owner";

// Public profile of another student — INSTAGRAM-STYLE since
// 2026-11-17 (owner's reference screenshots): avatar beside the
// stats row (Posts · Followers · Following, counts tap through to
// the lists), name + bio, the Follow button, then icon tabs —
// Posts (their chirps as a grid), Karaoke (their covers) and
// About (the friends-only details).
//
// The DETAIL fields — gallery photos, portfolio links, stated
// intention — stay friends-only exactly as before: they render
// only when the viewer is matched with this student (accepted
// follow or mutual swipe), inside the About tab. Year, college,
// hall-ticket number and preferences are never read here.
//
// NOTE: this gating is at the app level. The base profiles table's
// RLS (profiles_select_public) still lets any signed-in student
// read those columns through the API directly — the product
// surfaces are gated, the raw table is not (tracked as a separate
// hardening item).
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = normaliseUsername(rawUsername);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;

  // My own public page is just my profile.
  if (account && account.username === username) {
    redirect("/profile");
  }

  const profile = await getPublicProfileByUsername(supabase, username);
  if (!profile) notFound();
  const publicProfile = profile;

  // Follow state + friendship, resolved server-side on the service
  // role (follow_requests has no client policies). A pending request
  // TO me maps to a plain "Follow" button — answering it happens in
  // my Inbox.
  //
  // DEVELOPER ANONYMITY (owner's rule): the OneUCo Developer's own
  // profile is NEVER unlocked — not by a match, not by an accepted
  // follow. The page renders a masked identity ("OneUCo Developer",
  // no photo, bio, branch or details), no Follow button, no stats
  // and no tabs at all.
  let followUiState: FollowUiState | null = null;
  let canSeeDetails = false;
  let isDeveloperProfile = false;
  let viewerAccent = accentHex(null);
  let admin: ReturnType<typeof createAdminClient> | null = null;
  if (account) {
    const viewer = account;
    try {
      admin = createAdminClient();
    } catch {
      admin = null;
    }
    const [myProfile, followState, targetEmail] = await Promise.all([
      getProfileByAccountId(supabase, viewer.id),
      (async (): Promise<FollowState | null> => {
        if (!admin) return null;
        try {
          return await getFollowState(admin, viewer.id, publicProfile.accountId);
        } catch {
          return null;
        }
      })(),
      (async (): Promise<string | null> => {
        if (!admin) return null;
        try {
          const { data } = await admin
            .from("accounts")
            .select("email")
            .eq("id", publicProfile.accountId)
            .maybeSingle();
          return ((data ?? null) as { email: string } | null)?.email ?? null;
        } catch {
          return null;
        }
      })(),
    ]);
    viewerAccent = accentHex(myProfile?.accent_color);
    isDeveloperProfile = isOwnerEmail(targetEmail);
    if (isDeveloperProfile) {
      followUiState = null;
      canSeeDetails = false;
    } else if (followState === "friends" || followState === "accepted") {
      followUiState = "friends";
      canSeeDetails = true;
    } else if (followState === "pending_out") {
      followUiState = "requested";
    } else if (followState !== null) {
      followUiState = "follow";
    }
  }
  // Display name is optional at sign-up — fall back to the @handle.
  const displayName = publicProfile.name.trim()
    ? publicProfile.name
    : `@${publicProfile.username}`;

  // Stats + Posts (skipped entirely for the masked developer).
  let followers = 0;
  let following = 0;
  let postCount = 0;
  let posts: ChirpView[] = [];
  if (account && !isDeveloperProfile) {
    try {
      if (admin) {
        const counts = await getFollowCounts(admin, publicProfile.accountId);
        followers = counts.followers;
        following = counts.following;
      }
    } catch {
      // Zeroes stand.
    }
    postCount = await countChirpsByAuthor(supabase, publicProfile.accountId).catch(
      () => 0,
    );
    posts = await listChirpsByAuthor(
      supabase,
      publicProfile.accountId,
      account.id,
      30,
      admin,
    ).catch(() => []);
  }

  // Covers (Music Mitra, migration 0017): a public showcase —
  // visible to any signed-in visitor, NOT behind the follow gate
  // (owner's ask: anyone who sees the profile can listen). Never
  // on the developer's masked profile. Fail-soft null pre-setup.
  let covers: Awaited<ReturnType<typeof listCoversForProfile>> = null;
  if (account && !isDeveloperProfile) {
    covers = await listCoversForProfile(
      supabase,
      publicProfile.accountId,
      account.id,
    );
  }

  // Detail fields — read ONLY for friends (see header note).
  let gallery: string[] = [];
  let portfolio: Portfolio | null = null;
  let intentionLabel: string | null = null;
  if (canSeeDetails) {
    const { data: detailData } = await supabase
      .from("profiles")
      .select("photo_urls, portfolio, intention")
      .eq("account_id", publicProfile.accountId)
      .maybeSingle();
    const detailRow = (detailData ?? null) as {
      photo_urls: string[];
      portfolio: Record<string, string>;
      intention: string | null;
    } | null;
    gallery = (detailRow?.photo_urls ?? []).filter(
      (url) => url && url !== publicProfile.photoUrl,
    );
    const normalised = normalisePortfolio(detailRow?.portfolio ?? {});
    portfolio =
      normalised.github || normalised.linkedin || normalised.website || normalised.other
        ? normalised
        : null;
    intentionLabel =
      INTENTIONS.find((row) => row.id === detailRow?.intention)?.label ?? null;
  }

  const statClass = "flex flex-col items-center gap-0.5";
  const statNumber = "text-lg font-bold leading-none text-white";
  const statLabel = "text-xs text-neutral-400";

  const aboutNode = isDeveloperProfile ? null : !account ? null : canSeeDetails ? (
    <div className="flex flex-col gap-4">
      {intentionLabel ? (
        <p className="text-sm text-neutral-400">
          Looking for: <span className="text-neutral-200">{intentionLabel}</span>
        </p>
      ) : null}
      {gallery.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={`${publicProfile.name}'s photo`}
              className="aspect-square w-full rounded-2xl object-cover"
            />
          ))}
        </div>
      ) : null}
      {portfolio ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Portfolio
          </h2>
          <ul className="flex flex-col gap-1.5">
            {(
              [
                ["github", "GitHub"],
                ["linkedin", "LinkedIn"],
                ["website", "Website"],
                ["other", "Other"],
              ] as const
            ).map(([key, label]) =>
              portfolio && portfolio[key] ? (
                <li key={key}>
                  <a
                    href={portfolio[key]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-sky-300 transition hover:underline"
                  >
                    {label} →
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ) : null}
      {!intentionLabel && gallery.length === 0 && !portfolio ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          {displayName} hasn&apos;t added gallery photos or portfolio links
          yet.
        </p>
      ) : null}
    </div>
  ) : (
    <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
      🔒 Follow @{publicProfile.username} and get accepted to see their
      full profile — gallery, portfolio and what they&apos;re looking for.
    </p>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/swipe"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          @{publicProfile.username}
        </p>
      </div>

      {isDeveloperProfile ? (
        <>
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
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
            🔒 The OneUCo Developer&apos;s profile stays private — it is
            never unlocked, even for friends.
          </p>
        </>
      ) : (
        <>
          {/* Avatar + stats row. */}
          <div className="flex items-center gap-6">
            <Avatar
              name={displayName}
              photoUrl={publicProfile.photoUrl}
              sizeClass="h-20 w-20"
              textClass="text-2xl"
              transformWidth={256}
            />
            <div className="grid flex-1 grid-cols-3">
              <div className={statClass}>
                <span className={statNumber}>{postCount}</span>
                <span className={statLabel}>posts</span>
              </div>
              <Link
                href={`/profile/${publicProfile.username}/followers`}
                className={`${statClass} transition hover:opacity-80`}
              >
                <span className={statNumber}>{followers}</span>
                <span className={statLabel}>followers</span>
              </Link>
              <Link
                href={`/profile/${publicProfile.username}/following`}
                className={`${statClass} transition hover:opacity-80`}
              >
                <span className={statNumber}>{following}</span>
                <span className={statLabel}>following</span>
              </Link>
            </div>
          </div>

          {/* Name, bio. */}
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-white">{displayName}</p>
            {publicProfile.branch ? (
              <p className="text-xs text-neutral-400">{publicProfile.branch}</p>
            ) : null}
            {publicProfile.bio ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                {publicProfile.bio}
              </p>
            ) : null}
          </div>

          {/* Follow button. */}
          {account && followUiState ? (
            <div className="flex">
              <FollowButton
                targetAccountId={publicProfile.accountId}
                initialState={followUiState}
                accentHex={viewerAccent}
              />
            </div>
          ) : null}

          {/* Tabs: Posts · Karaoke · About. */}
          <ProfileTabs
            tabs={[
              {
                id: "posts",
                label: "Posts",
                icon: <span aria-hidden>▦</span>,
                node: (
                  <ProfilePosts
                    initialChirps={posts}
                    emptyText={`${displayName} hasn't posted yet.`}
                  />
                ),
              },
              {
                id: "karaoke",
                label: "Karaoke covers",
                icon: <span aria-hidden>🎤</span>,
                node:
                  covers !== null ? (
                    <ProfileCovers
                      initialCovers={covers}
                      canManage={false}
                      myAccountId={null}
                      profileName={displayName}
                    />
                  ) : null,
              },
              {
                id: "about",
                label: "About",
                icon: <span aria-hidden>ⓘ</span>,
                node: aboutNode,
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
