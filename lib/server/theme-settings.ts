import { unstable_cache, revalidateTag } from "next/cache";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getTheme,
  isThemeId,
  parseThemeSetting,
  themeSettingToStorage,
  type AppTheme,
  type ThemeSetting,
} from "@/lib/themes";
import { parseDialSkin, type DialSkinId } from "@/lib/dial-skins";

// Server-only: the app-wide default interface lives in
// public.app_settings key 'theme' (migration 0008), read/written via
// the service-role client exactly like the Diwali mode (migration
// 0003). The stored value is JSON text — {"mode":"auto"} or
// {"mode":"manual","id":"ocean"} — because the live app_settings.value
// column is text; on a fresh database (jsonb column) the same JSON
// string lands as a parsed object, and parseThemeSetting accepts both.
//
// Fail-soft everywhere: a missing table/column, a bad value or a dead
// service key all degrade to 'auto' — the seasonal look — and never to
// a broken page. That also makes the code safe to deploy BEFORE
// migration 0008 runs.
//
// The admin read is wrapped in unstable_cache (30s revalidate, same
// trade-off as the Diwali mode): the root layout asks on every render,
// and the value changes only when the owner picks a new default in
// /admin/appearance. setThemeSetting busts the tag so the owner's own
// next navigation is fresh; everyone else converges within ~30s.

const readThemeSetting = unstable_cache(
  async (): Promise<ThemeSetting> => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "theme")
        .maybeSingle();
      if (error || !data) return { mode: "auto" };
      return parseThemeSetting(data.value);
    } catch {
      return { mode: "auto" };
    }
  },
  ["app-theme-setting"],
  { revalidate: 30, tags: ["app-theme"] },
);

export async function getThemeSetting(): Promise<ThemeSetting> {
  return readThemeSetting();
}

/** The admin's manual default interface, or null in auto mode. */
export async function getAdminTheme(): Promise<AppTheme | null> {
  const setting = await getThemeSetting();
  return setting.mode === "manual" ? getTheme(setting.id) : null;
}

export async function setThemeSetting(setting: ThemeSetting): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_settings").upsert({
      key: "theme",
      value: themeSettingToStorage(setting),
      updated_at: new Date().toISOString(),
    });
    if (error) return false;
    revalidateTag("app-theme");
    return true;
  } catch {
    return false;
  }
}

/**
 * The signed-in user's own interface pick (profiles.theme_id,
 * migration 0008), read with the caller's session client. Deliberately
 * NOT folded into lib/profile's PROFILE_COLUMNS: that read feeds every
 * profile surface, and until migration 0008 lands the column doesn't
 * exist — a dedicated fail-soft read keeps the rest of the app immune.
 * One narrow query per call; the root layout and the dial data are the
 * only callers, once per render each.
 *
 * Wrapped in React cache(): within one request the layout's
 * resolveAppliedTheme, the dial data and the profile page can all ask,
 * and — with createClient() cache()-shared (lib/supabase/server) —
 * they pass the identical client, so the query runs ONCE per request
 * instead of once per caller. (Writes go through
 * app/profile/theme-actions, which updates profiles.theme_id directly
 * and never reads it back in the same request.)
 */
export const getProfileThemeId = cache(readProfileThemeId);

async function readProfileThemeId(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_id")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) return null;
    const value = (data as { theme_id?: unknown }).theme_id;
    return isThemeId(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user's own dial wheel skin (profiles.dial_skin,
 * migration 0010), read exactly like getProfileThemeId: one narrow
 * fail-soft query, React cache()-shared across the request's callers
 * (dial data, profile page). 'auto' — the wheel wears the applied
 * interface's own skin — is both the stored default and the degrade
 * target for a missing column / bad value, so the dial is safe to
 * deploy before the migration lands.
 */
export const getProfileDialSkin = cache(readProfileDialSkin);

async function readProfileDialSkin(
  supabase: SupabaseClient,
  accountId: string,
): Promise<DialSkinId> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("dial_skin")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) return "auto";
    return parseDialSkin((data as { dial_skin?: unknown }).dial_skin);
  } catch {
    return "auto";
  }
}

/**
 * Whether the one-time dial-style tip card has been shown
 * (profiles.dial_tip_seen, migration 0010). Tri-state ON PURPOSE:
 *   true  — seen; never show the card again.
 *   false — column read cleanly and it has never been shown: show it.
 *   null  — the read FAILED (column absent pre-migration, transient
 *           error): the home page must NOT show the card, because a
 *           card it cannot persist-dismiss would risk showing on
 *           every visit — the exact failure the owner ruled out.
 * Same narrow fail-soft shape as the reads above.
 */
export const getProfileDialTipSeen = cache(readProfileDialTipSeen);

async function readProfileDialTipSeen(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("dial_tip_seen")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error || !data) return null;
    const value = (data as { dial_tip_seen?: unknown }).dial_tip_seen;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Full resolution for one signed-in user, highest precedence first:
 * their own profiles.theme_id pick, then the admin manual default,
 * else null (seasonal auto — no stamp, today's look). Used by the
 * root layout to stamp <html>.
 */
export async function resolveAppliedTheme(
  supabase: SupabaseClient,
  accountId: string | null,
): Promise<AppTheme | null> {
  // The two reads are independent — the user's pick and the admin
  // default — so run them together instead of serially. Precedence is
  // unchanged: a valid own pick still wins; the admin read is
  // unstable_cache'd (30s), so consulting it even when the user has a
  // pick costs no round trip in the steady state.
  const [ownId, adminTheme] = await Promise.all([
    accountId
      ? getProfileThemeId(supabase, accountId)
      : Promise.resolve(null),
    getAdminTheme(),
  ]);
  return getTheme(ownId) ?? adminTheme;
}
