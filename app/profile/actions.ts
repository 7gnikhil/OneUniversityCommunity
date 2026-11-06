"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { ACCENT_COLORS } from "@/lib/validation";
import {
  normalisePortfolio,
  normalisePreferences,
} from "@/lib/preferences";
import type { Intention } from "@/lib/types";

export interface ProfileFormState {
  error: string | null;
  saved: boolean;
}

const INTENTION_IDS: ReadonlyArray<Intention> = [
  "dating",
  "friendship",
  "study_partner",
  "networking",
];

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function cleanText(raw: string, maxLength: number): string {
  return raw.trim().slice(0, maxLength);
}

// Profile save. All writes go through the SESSION client, so the profiles
// RLS policies (owner-only insert/update) do the enforcing. Only public
// fields exist on profiles — the college and graduation year declared at
// joining are never accepted here; they live on the private accounts row.
export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session has expired — please log in again.", saved: false };
  }
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) {
    return { error: "Finish creating your account first (on the profile completion page).", saved: false };
  }
  const accountId: string = account.id;

  const name = cleanText(String(formData.get("name") ?? ""), 80);
  const bio = cleanText(String(formData.get("bio") ?? ""), 300);
  const branch = cleanText(String(formData.get("branch") ?? ""), 80);

  // Photo URLs must point into this account's own avatars folder — the
  // editor uploads there, and anything else is rejected rather than
  // silently stored.
  const ownPathMarker = `/avatars/${accountId}/`;
  const photoUrlRaw = String(formData.get("photoUrl") ?? "").trim();
  if (photoUrlRaw && !photoUrlRaw.includes(ownPathMarker)) {
    return { error: "That profile photo didn't come through — please re-upload it.", saved: false };
  }
  const photoUrlsRaw = parseJson(String(formData.get("photoUrls") ?? "[]"));
  const photoUrls: string[] = Array.isArray(photoUrlsRaw)
    ? photoUrlsRaw
        .filter(
          (row): row is string =>
            typeof row === "string" && row.includes(ownPathMarker),
        )
        .slice(0, 6)
    : [];

  const portfolio = normalisePortfolio(
    parseJson(String(formData.get("portfolio") ?? "{}")),
  );
  const preferences = normalisePreferences(
    parseJson(String(formData.get("preferences") ?? "{}")),
  );

  const intentionRaw = String(formData.get("intention") ?? "");
  const intention: Intention | null = INTENTION_IDS.includes(
    intentionRaw as Intention,
  )
    ? (intentionRaw as Intention)
    : null;

  const accentRaw = String(formData.get("accentColor") ?? "black");
  const accentColor = ACCENT_COLORS.some((row) => row.id === accentRaw)
    ? accentRaw
    : "black";

  const { error } = await supabase.from("profiles").upsert(
    {
      account_id: accountId,
      name,
      bio: bio || null,
      branch: branch || null,
      photo_url: photoUrlRaw || null,
      photo_urls: photoUrls,
      portfolio: portfolio as unknown as Record<string, string>,
      intention,
      preferences: preferences as unknown as Record<
        string,
        Record<string, unknown>
      >,
      accent_color: accentColor,
    },
    { onConflict: "account_id" },
  );

  if (error) {
    return { error: "Couldn't save your profile — please try again.", saved: false };
  }
  return { error: null, saved: true };
}
