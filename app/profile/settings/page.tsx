import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { isOwnerEmail } from "@/lib/server/owner";
import {
  ratingForAccount,
  type FlingRating,
} from "@/lib/fling-rating";
import { getProfileByAccountId } from "@/lib/profile";
import {
  DEFAULT_PRIVACY,
  getPrivacySettings,
  type PrivacySettings,
} from "@/lib/presence";
import {
  EMPTY_PORTFOLIO,
  normalisePortfolio,
  normalisePreferences,
} from "@/lib/preferences";
import { getFlingProfile } from "@/lib/fling";
import { accentHex } from "@/lib/validation";
import { ABOUT_ONEUCO, FAQS, RULES } from "@/lib/help-content";
import { listMyDeveloperRequestsAction } from "@/app/help/actions";
import DeveloperRequestForm from "@/app/help/DeveloperRequestForm";
import ProfileEditor, { type ProfileEditorInitial } from "../ProfileEditor";
import FlingProfileEditor from "../FlingProfileEditor";
import InterfacePicker from "@/components/InterfacePicker";
import DialSkinPicker from "@/components/DialSkinPicker";
import NotificationSettings from "@/components/NotificationSettings";
import AnimatedDropdown from "@/components/AnimatedDropdown";
import Avatar from "@/components/Avatar";
import PageIntro from "@/components/PageIntro";
import { getTheme } from "@/lib/themes";
import {
  getAdminTheme,
  getProfileDialSkin,
  getProfileThemeId,
} from "@/lib/server/theme-settings";

// Settings and activity — this page IS the pre-2026-11-17 /profile
// page, moved behind the profile's ⚙ Settings button when the
// profile itself went Instagram-style (owner's reference
// screenshots, 2026-11-17). NOTHING was removed: every section and
// field that lived on the old profile page lives here, organised
// into SIX sections (owner's layout, 2026-11-10; section 6 added
// with the re-engagement batch, 2026-11-11) — every field lives in
// exactly ONE of them:
//   1. Profile      — personal data (ProfileEditor + privacy toggles).
//   2. Fling data   — the separate deck-only profile (migration 0012).
//   3. Display      — the interface picker + dial wheel picker.
//   4. Queries      — the Req to Developer form (the SAME component and
//                     developer_requests flow as /help — not a copy).
//   5. About & FAQs — about OneUco + the shared FAQ/rules content
//                     (lib/help-content.ts, also rendered by /help).
//   6. Notifications & app — per-device push toggles + PWA install
//                     (re-engagement batch; device state, not account
//                     fields, so nothing here duplicates a field above).
// Each section is presented as an AnimatedDropdown (owner's follow-up
// ask): the closed bar carries the section title + a one-line summary,
// the body expands/collapses with the shared 300ms animation. Profile
// starts OPEN, the other four closed; sections opt out of the pickers'
// collapse-on-submit so their own forms save in place. Presentation
// only — every field stays in the section it already lived in.
// The college and graduation year declared at joining are never read
// here — they live on the private accounts row, in no section at all.
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

  const portfolio = profile
    ? normalisePortfolio(profile.portfolio)
    : EMPTY_PORTFOLIO;

  // Chat privacy switches (migration 0007) — read through the service
  // role with the WhatsApp defaults as the fail-soft fallback, so the
  // toggles render correctly even before the migration lands.
  let privacy: PrivacySettings = DEFAULT_PRIVACY;
  try {
    privacy = await getPrivacySettings(createAdminClient(), account.id);
  } catch {
    // Defaults stand.
  }

  const accent = accentHex(profile?.accent_color);

  const initial: ProfileEditorInitial = {
    accountId: account.id,
    username: account.username,
    oneucoId: account.oneuco_id,
    name: profile?.name ?? "",
    bio: profile?.bio ?? "",
    branch: profile?.branch ?? "",
    photoUrl: profile?.photo_url ?? null,
    photoUrls: profile?.photo_urls ?? [],
    portfolio,
    intention: profile?.intention ?? null,
    preferences: normalisePreferences(profile?.preferences ?? {}),
    accentColor: profile?.accent_color ?? "black",
    showOnline: privacy.showOnline,
    readReceipts: privacy.readReceipts,
  };

  // Fling data (migration 0012) — the helper fails soft to an empty
  // fling profile until the table lands.
  const flingProfile = await getFlingProfile(supabase, account.id);

  // My Fling ratings — derived from likes received (lib/fling-
  // rating): this week's score (the one my card shows) and the
  // all-time one. Absent until someone has swiped on me.
  let weeklyRating: FlingRating | null = null;
  let allTimeRating: FlingRating | null = null;
  try {
    const admin = createAdminClient();
    weeklyRating = await ratingForAccount(admin, account.id, 7);
    allTimeRating = await ratingForAccount(admin, account.id);
  } catch {
    weeklyRating = null;
    allTimeRating = null;
  }

  // Queries — my existing developer requests, for the shared form's
  // tracking list (same action /help uses).
  const myRequests = await listMyDeveloperRequestsAction();

  // Display reads fail soft (theme-settings helpers) until migrations
  // 0008/0010 land.
  const myThemeId = await getProfileThemeId(supabase, account.id);
  const adminTheme = await getAdminTheme();

  // The Display section's closed-bar summary: the interface actually
  // in force (my pick, else the admin default, else the seasonal
  // look) — the pickers inside carry the detail.
  const displaySummary =
    getTheme(myThemeId)?.name ??
    getTheme(adminTheme?.id ?? null)?.name ??
    "Seasonal look";

  return (
    <main data-section="profile" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      {/* WhatsApp Settings layout (2026-11-17): plain "Settings"
          header, then the profile card (big avatar, name, about
          line), then icon-chip rows for every section. */}
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="text-lg text-neutral-300 transition hover:text-white"
          aria-label="Back to profile"
        >
          ←
        </Link>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>
      <PageIntro section="profile" />

      {/* The WhatsApp profile card — identity at a glance; the
          editing itself lives in the Profile section below. */}
      <div className="flex items-center gap-3.5 border-b border-neutral-900 pb-5">
        <Avatar
          name={initial.name.trim() ? initial.name : account.username}
          photoUrl={initial.photoUrl}
          sizeClass="h-16 w-16"
          textClass="text-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium text-white">
            {initial.name.trim() ? initial.name : account.username}
          </p>
          <p className="truncate text-sm text-neutral-500">
            @{account.username} · OneUco ID {account.oneuco_id}
          </p>
        </div>
        <span className="text-xl text-neutral-600" aria-hidden>
          ›
        </span>
      </div>

      {/* Owner-only Admin door. This used to live in the /home
          footer; when the home page was removed (2026-11-11) the
          admin area lost its only in-app entrance, so it lives
          here now — rendered for the owner's email alone, exactly
          the population the /admin gate itself admits. */}
      {isOwnerEmail(account.email) ? (
        <Link
          href="/admin"
          className="flex items-center gap-3 py-1 transition hover:opacity-80"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500 text-lg">
            🛡
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-medium text-white">Admin</span>
            <span className="text-xs text-neutral-500">Open the admin area</span>
          </span>
          <span className="text-xl text-neutral-600" aria-hidden>
            ›
          </span>
        </Link>
      ) : null}

      {/* The sections as WhatsApp rows (AnimatedDropdown's icon
          variant) — same bodies, same forms, new chrome. */}
      <div className="flex flex-col divide-y divide-neutral-900">
        {/* ── 1 · Profile — personal data (starts OPEN) ───────────── */}
        <AnimatedDropdown
          title="Profile"
          currentLabel="Personal data & privacy"
          icon="🔑"
          tint="bg-amber-500"
          defaultOpen
          collapseOnSubmit={false}
        >
          <div className="mt-4 flex flex-col gap-4">
            <ProfileEditor initial={initial} />
          </div>
        </AnimatedDropdown>

        {/* ── 2 · Fling data — the deck-only profile ──────────────── */}
        <AnimatedDropdown
          title="Fling data"
          currentLabel="Bio, likes & dislikes"
          icon="♥"
          tint="bg-rose-500"
          collapseOnSubmit={false}
        >
          <div className="mt-4 flex flex-col gap-4">
            {weeklyRating || allTimeRating ? (
              <p className="text-sm text-neutral-300">
                Your Fling rating this week:{" "}
                <span className="font-semibold text-white">
                  {weeklyRating
                    ? `★ ${weeklyRating.rating.toFixed(1)}`
                    : "no swipes yet"}
                </span>{" "}
                <span className="text-neutral-500">
                  {weeklyRating
                    ? `· from ${weeklyRating.likes} like${weeklyRating.likes === 1 ? "" : "s"} (${weeklyRating.total} swipes) `
                    : ""}
                  {allTimeRating
                    ? `· all-time ★ ${allTimeRating.rating.toFixed(1)} from ${allTimeRating.likes} likes`
                    : ""}
                  {" "}— it rides on your Fling card; more right swipes
                  this week, higher it climbs
                </span>
              </p>
            ) : null}
            <FlingProfileEditor initial={flingProfile} accentHex={accent} />
          </div>
        </AnimatedDropdown>

        {/* ── 3 · Display — interface + dial style ────────────────── */}
        <AnimatedDropdown
          title="Display"
          currentLabel={displaySummary}
          icon="🎨"
          tint="bg-violet-500"
          collapseOnSubmit={false}
        >
          {/* Interface picker — the full-app look, picked from this list
              (profiles.theme_id). */}
          <InterfacePicker
            currentId={myThemeId}
            defaultId={adminTheme?.id ?? null}
          />
          {/* Dial style picker — the list twin of the dial's long-press
              wheel-style mode; both save profiles.dial_skin via the same
              action family. */}
          <DialSkinPicker
            currentId={await getProfileDialSkin(supabase, account.id)}
            appliedThemeId={myThemeId ?? adminTheme?.id ?? null}
          />
        </AnimatedDropdown>

        {/* ── 4 · Queries — ask the developer ─────────────────────── */}
        <AnimatedDropdown
          title="Queries"
          currentLabel="Ask the developer"
          icon="💬"
          tint="bg-sky-500"
          collapseOnSubmit={false}
        >
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs leading-relaxed text-neutral-500">
              A question, a bug, an idea — this is the one place to send it.
            </p>
            <DeveloperRequestForm initialRequests={myRequests} accentHex={accent} />
          </div>
        </AnimatedDropdown>

        {/* ── 5 · About & FAQs ────────────────────────────────────── */}
        <AnimatedDropdown
          title="About & FAQs"
          currentLabel="About, FAQs & rules"
          icon="ℹ️"
          tint="bg-neutral-500"
          collapseOnSubmit={false}
        >
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-neutral-300">
              {ABOUT_ONEUCO}
            </p>
            <div className="flex flex-col gap-2">
              {FAQS.map((faq) => (
                <details
                  key={faq.q}
                  className="rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3"
                >
                  <summary className="cursor-pointer text-sm font-medium">{faq.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{faq.a}</p>
                </details>
              ))}
            </div>
            <h3 className="text-sm font-medium">Community rules</h3>
            <ul className="flex list-disc flex-col gap-1.5 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-4 text-sm leading-relaxed text-neutral-300">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </AnimatedDropdown>

        {/* ── 6 · Notifications & app — push + install ──────────── */}
        <AnimatedDropdown
          title="Notifications & app"
          currentLabel="Matches, messages & requests"
          icon="🔔"
          tint="bg-emerald-500"
          collapseOnSubmit={false}
        >
          <div className="mt-4 flex flex-col gap-4">
            <NotificationSettings
              vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
            />
          </div>
        </AnimatedDropdown>

        {/* My covers used to be section 7 here — they moved to the
            profile's Karaoke tab (2026-11-17), which is the same
            ProfileCovers component with the same studio. */}
      </div>
    </main>
  );
}
