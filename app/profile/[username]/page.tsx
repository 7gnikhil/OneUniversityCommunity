import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getPublicProfileByUsername } from "@/lib/social";
import { getProfileByAccountId } from "@/lib/profile";
import { getFollowState, type FollowState } from "@/lib/follows";
import { INTENTIONS, normalisePortfolio, type Portfolio } from "@/lib/preferences";
import type { FollowUiState } from "@/app/follow/actions";
import FollowButton from "@/components/FollowButton";
import { accentHex, normaliseUsername } from "@/lib/validation";
import { isOwnerEmail } from "@/lib/server/owner";

// Public profile of another student — read-only. Everyone signed in sees
// the basics (photo, name, @username, bio, branch). The DETAIL fields —
// gallery photos, portfolio links, stated intention — are friends-only:
// they render only when the viewer owns the page (impossible here; own
// page redirects to /profile) or is matched with this student (accepted
// follow or mutual swipe). Year, college, hall-ticket number and
// preferences are never read here — they are not public and this page
// must not become a leak path.
//
// NOTE: this gating is at the app level. The base profiles table's RLS
// (profiles_select_public) still lets any signed-in student read those
// columns through the API directly — the product surfaces are gated,
// the raw table is not (tracked as a separate hardening item).
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

  // My own public page is just my profile editor.
  if (account && account.username === username) {
    redirect("/profile");
  }

  const profile = await getPublicProfileByUsername(supabase, username);
  if (!profile) notFound();
  const publicProfile = profile;

  // Follow state + friendship, resolved server-side on the service role
  // (follow_requests has no client policies). A pending request TO me
  // maps to a plain "Follow" button — answering it happens in my Inbox.
  //
  // DEVELOPER ANONYMITY (owner's rule): the OneUCo Developer's own profile
  // is NEVER unlocked — not by a match, not by an accepted follow. The
  // page renders a masked identity ("OneUCo Developer", no photo, bio,
  // branch or details) and no Follow button at all.
  let followUiState: FollowUiState | null = null;
  let canSeeDetails = false;
  let isDeveloperProfile = false;
  let viewerAccent = accentHex(null);
  if (account) {
    const viewer = account;
    const [myProfile, followState, targetEmail] = await Promise.all([
      getProfileByAccountId(supabase, viewer.id),
      (async (): Promise<FollowState | null> => {
        try {
          const admin = createAdminClient();
          return await getFollowState(admin, viewer.id, publicProfile.accountId);
        } catch {
          return null;
        }
      })(),
      (async (): Promise<string | null> => {
        try {
          const admin = createAdminClient();
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Profile
        </p>
      </div>

      {isDeveloperProfile ? (
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
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          {publicProfile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicProfile.photoUrl}
              alt={displayName}
              className="h-28 w-28 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-800 text-4xl font-semibold text-neutral-400">
              {displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold">{displayName}</h1>
            <p className="text-sm text-neutral-500">@{publicProfile.username}</p>
          </div>
          {publicProfile.branch ? (
            <span className="rounded-full border border-neutral-700 px-3 py-0.5 text-xs text-neutral-300">
              {publicProfile.branch}
            </span>
          ) : null}
          {publicProfile.bio ? (
            <p className="max-w-sm text-sm leading-relaxed text-neutral-300">
              {publicProfile.bio}
            </p>
          ) : null}
          {account && followUiState ? (
            <FollowButton
              targetAccountId={publicProfile.accountId}
              initialState={followUiState}
              accentHex={viewerAccent}
            />
          ) : null}
        </div>
      )}

      {canSeeDetails ? (
        <>
          {intentionLabel ? (
            <p className="text-center text-sm text-neutral-400">
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
        </>
      ) : account && isDeveloperProfile ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          🔒 The OneUCo Developer&apos;s profile stays private — it is never
          unlocked, even for friends.
        </p>
      ) : account ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center text-sm leading-relaxed text-neutral-400">
          🔒 Follow @{publicProfile.username} and get accepted to see their
          full profile.
        </p>
      ) : null}
    </main>
  );
}
