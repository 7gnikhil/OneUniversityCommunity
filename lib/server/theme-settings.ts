import { unstable_cache, revalidateTag } from "next/cache";
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
 */
export async function getProfileThemeId(
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
 * Full resolution for one signed-in user, highest precedence first:
 * their own profiles.theme_id pick, then the admin manual default,
 * else null (seasonal auto — no stamp, today's look). Used by the
 * root layout to stamp <html>.
 */
export async function resolveAppliedTheme(
  supabase: SupabaseClient,
  accountId: string | null,
): Promise<AppTheme | null> {
  if (accountId) {
    const ownId = await getProfileThemeId(supabase, accountId);
    const own = getTheme(ownId);
    if (own) return own;
  }
  return getAdminTheme();
}
