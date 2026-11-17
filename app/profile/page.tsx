import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import { getFollowCounts } from "@/lib/follows";
import {
  countChirpsByAuthor,
  listChirpsByAuthor,
  listSavedChirps,
} from "@/lib/chirp";
import { listCoversForProfile } from "@/lib/covers";
import { ratingForAccount } from "@/lib/fling-rating";
import { INTENTIONS } from "@/lib/preferences";
import Avatar from "@/components/Avatar";
import ProfileTabs from "@/components/ProfileTabs";
import ProfilePosts from "@/components/ProfilePosts";
import ProfileCovers from "@/components/ProfileCovers";
import ShareProfileButton from "@/components/ShareProfileButton";
import ProfileQr from "@/components/ProfileQr";

// My profile — INSTAGRAM-STYLE (owner's reference screenshots,
// 2026-11-17): @username + ⚙ on top, avatar beside the stats row
// (Posts · Followers · Following, the counts tap through to the
// lists), name + bio, Edit profile / Share profile buttons, then
// icon tabs — Posts (my chirps as a grid) and Karaoke (my covers).
//
// Everything that used to live on this page — the profile editor,
// Fling data, Display, Queries, About & FAQs, Notifications — moved
// UNCHANGED to /profile/settings, behind the ⚙ button and the Edit
// profile button (app/profile/settings/page.tsx). Covers moved
// here into the Karaoke tab (same component, same studio).
export default async function ProfilePage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);

  if (!account) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Your account isn&apos;t finished yet — complete sign-up first, then
          your profile opens up here.
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

  const profile = await getProfileByAccountId(supabase, account.id);
  const displayName = profile?.name?.trim()
    ? profile.name
    : `@${account.username}`;

  // Stats + tab content. Follow counts live on the service role
  // (follow_requests has no client policies); everything fails soft
  // to zeroes / empty lists rather than breaking the profile.
  let followers = 0;
  let following = 0;
  let weeklyRating: number | null = null;
  try {
    const admin = createAdminClient();
    const counts = await getFollowCounts(admin, account.id);
    followers = counts.followers;
    following = counts.following;
    const rating = await ratingForAccount(admin, account.id, 7);
    weeklyRating = rating?.rating ?? null;
  } catch {
    // Zeroes stand.
  }

  const [posts, postCount, myCovers, savedPosts] = await Promise.all([
    listChirpsByAuthor(supabase, account.id, account.id, 30).catch(() => []),
    countChirpsByAuthor(supabase, account.id).catch(() => 0),
    listCoversForProfile(supabase, account.id, account.id),
    listSavedChirps(supabase, account.id, 30).catch(() => []),
  ]);

  const intentionLabel =
    INTENTIONS.find((row) => row.id === profile?.intention)?.label ?? null;

  const statClass = "flex flex-col items-center gap-0.5";
  const statNumber = "text-lg font-bold leading-none text-white";
  const statLabel = "text-xs text-neutral-400";

  return (
    <main
      data-section="profile"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6"
    >
      {/* Top bar: @username + settings gear. */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          {account.username}
        </h1>
        <Link
          href="/profile/settings"
          aria-label="Settings and activity"
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-neutral-200 transition hover:bg-white/5 hover:text-white"
        >
          ⚙
        </Link>
      </div>

      {/* Avatar + stats row. */}
      <div className="flex items-center gap-6">
        <Avatar
          name={displayName}
          photoUrl={profile?.photo_url ?? null}
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
            href={`/profile/${account.username}/followers`}
            className={`${statClass} transition hover:opacity-80`}
          >
            <span className={statNumber}>{followers}</span>
            <span className={statLabel}>followers</span>
          </Link>
          <Link
            href={`/profile/${account.username}/following`}
            className={`${statClass} transition hover:opacity-80`}
          >
            <span className={statNumber}>{following}</span>
            <span className={statLabel}>following</span>
          </Link>
        </div>
      </div>

      {/* Name, bio, chips. */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-white">{displayName}</p>
        {profile?.branch ? (
          <p className="text-xs text-neutral-400">{profile.branch}</p>
        ) : null}
        {profile?.bio ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
            {profile.bio}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="rounded-full border border-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-400">
            OneUco ID · {account.oneuco_id}
          </span>
          {intentionLabel ? (
            <span className="rounded-full border border-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-400">
              Looking for: {intentionLabel}
            </span>
          ) : null}
          {weeklyRating !== null ? (
            <span className="rounded-full border border-amber-900/60 bg-amber-950/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
              ★ {weeklyRating.toFixed(1)} on Fling this week
            </span>
          ) : null}
        </div>
      </div>

      {/* Buttons. */}
      <div className="flex gap-2">
        <Link
          href="/profile/settings"
          className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          Edit profile
        </Link>
        <ShareProfileButton
          username={account.username}
          path={`/profile/${account.username}`}
        />
        <ProfileQr username={account.username} />
      </div>

      {/* Tabs: Posts · Karaoke · Saved. */}
      <ProfileTabs
        tabs={[
          {
            id: "posts",
            label: "Posts",
            icon: <span aria-hidden>▦</span>,
            node: (
              <ProfilePosts
                initialChirps={posts}
                emptyText="No posts yet — your chirps will appear here as a grid. Post your first one from the Chirp tab."
              />
            ),
          },
          {
            id: "saved",
            label: "Saved posts",
            icon: <span aria-hidden>🔖</span>,
            node: (
              <ProfilePosts
                initialChirps={savedPosts}
                emptyText="Nothing saved yet — tap 🔖 Save on any chirp and it lands here, just for you."
              />
            ),
          },
          {
            id: "karaoke",
            label: "Karaoke covers",
            icon: <span aria-hidden>🎤</span>,
            node: (
              <ProfileCovers
                initialCovers={myCovers}
                canManage
                myAccountId={account.id}
                profileName={displayName}
              />
            ),
          },
        ]}
      />
    </main>
  );
}
