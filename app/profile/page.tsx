import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { getProfileByAccountId } from "@/lib/profile";
import {
  EMPTY_PORTFOLIO,
  normalisePortfolio,
  normalisePreferences,
} from "@/lib/preferences";
import ProfileEditor, { type ProfileEditorInitial } from "./ProfileEditor";

// Profile + Settings. Shows ONLY public fields (photo(s), name, bio,
// branch) plus the owner's @username / OneUco ID. The college and
// graduation year declared at joining are never read here — they live on
// the private accounts row and are not part of a public profile.
// Portfolio links are edited here (Settings -> Portfolio), NOT at sign-up.
// Nothing is mandatory: every field can stay empty.
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
  };

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
          Profile & Settings
        </p>
      </div>
      <ProfileEditor initial={initial} />
    </main>
  );
}
