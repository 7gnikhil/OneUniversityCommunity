import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

// Music Mitra KILL-SWITCH (owner's call, 2026-11-17). One app_settings
// key — 'music_mitra_enabled' ('on' | 'off') — flipped from /admin,
// no deploy needed. When 'off':
//   - the Mitra bottom tab disappears (BottomBar, via DialShell),
//   - the shell stops mounting the player (playback ends),
//   - /radio renders a "paused" notice instead of the player UI,
//   - /api/radio answers 503 for every mode,
//   - the Chirp sidebar drops its Music Mitra entry.
// Profile covers are NOT touched: they are students' own recordings
// (user content under the normal moderation / takedown path), not the
// licensed catalogue this switch exists for.
//
// FAIL-OPEN by design: a missing key, a missing table or any read
// error means music stays ON — the switch must never kill the feature
// by accident. The read is cached for 30s (same pattern as the Diwali
// mode), so a flip takes effect across the app within ~30 seconds.

const readMusicMitraEnabled = unstable_cache(
  async (): Promise<boolean> => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "music_mitra_enabled")
        .maybeSingle();
      if (error || !data) return true;
      return data.value !== "off";
    } catch {
      return true;
    }
  },
  ["music-mitra-enabled"],
  { revalidate: 30, tags: ["music-mitra-enabled"] },
);

export async function isMusicMitraEnabled(): Promise<boolean> {
  return readMusicMitraEnabled();
}

export async function setMusicMitraEnabled(enabled: boolean): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_settings").upsert({
      key: "music_mitra_enabled",
      value: enabled ? "on" : "off",
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}
