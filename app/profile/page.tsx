import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
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
import ProfileEditor, { type ProfileEditorInitial } from "./ProfileEditor";
import FlingProfileEditor from "./FlingProfileEditor";
import InterfacePicker from "@/components/InterfacePicker";
import DialSkinPicker from "@/components/DialSkinPicker";
import PageIntro from "@/components/PageIntro";
import {
  getAdminTheme,
  getProfileDialSkin,
  getProfileThemeId,
} from "@/lib/server/theme-settings";

// Profile & Settings, organised into FIVE sections (owner's layout,
// 2026-11-10) — every field lives in exactly ONE of them:
//   1. Profile      — personal data (ProfileEditor + privacy toggles).
//   2. Fling data   — the separate deck-only profile (migration 0012).
//   3. Display      — the interface picker + dial wheel picker.
//   4. Queries      — the Req to Developer form (the SAME component and
//                     developer_requests flow as /help — not a copy).
//   5. About & FAQs — about OneUco + the shared FAQ/rules content
//                     (lib/help-content.ts, also rendered by /help).
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

  // Queries — my existing developer requests, for the shared form's
  // tracking list (same action /help uses).
  const myRequests = await listMyDeveloperRequestsAction();

  // Display reads fail soft (theme-settings helpers) until migrations
  // 0008/0010 land.
  const myThemeId = await getProfileThemeId(supabase, account.id);
  const adminTheme = await getAdminTheme();

  return (
    <main data-section="profile" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← OneUco
        </Link>
        <p className="section-header-chip text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Profile & Settings
        </p>
      </div>
      <PageIntro section="profile" />

      {/* ── 1 · Profile — personal data ─────────────────────────────── */}
      <section aria-label="Profile" className="flex flex-col gap-4">
        <h2 className="border-b border-neutral-900 pb-2 text-base font-semibold">
          Profile
        </h2>
        <ProfileEditor initial={initial} />
      </section>

      {/* ── 2 · Fling data — the deck-only profile ──────────────────── */}
      <section aria-label="Fling data" className="flex flex-col gap-4">
        <h2 className="border-b border-neutral-900 pb-2 text-base font-semibold">
          Fling data
        </h2>
        <FlingProfileEditor initial={flingProfile} accentHex={accent} />
      </section>

      {/* ── 3 · Display — interface + dial style ────────────────────── */}
      <section aria-label="Display" className="flex flex-col">
        <h2 className="border-b border-neutral-900 pb-2 text-base font-semibold">
          Display
        </h2>
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
      </section>

      {/* ── 4 · Queries — ask the developer ─────────────────────────── */}
      <section aria-label="Queries" className="flex flex-col gap-4">
        <h2 className="border-b border-neutral-900 pb-2 text-base font-semibold">
          Queries
        </h2>
        <p className="text-xs leading-relaxed text-neutral-500">
          A question, a bug, an idea — this is the one place to send it.
        </p>
        <DeveloperRequestForm initialRequests={myRequests} accentHex={accent} />
      </section>

      {/* ── 5 · About & FAQs ────────────────────────────────────────── */}
      <section aria-label="About and FAQs" className="flex flex-col gap-4">
        <h2 className="border-b border-neutral-900 pb-2 text-base font-semibold">
          About &amp; FAQs
        </h2>
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
      </section>
    </main>
  );
}
