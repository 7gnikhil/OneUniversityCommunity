import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { diwaliLive, isDiwaliMode, type DiwaliMode } from "@/lib/diwali";

// Server-only: reads the Diwali mode from public.app_settings via the
// service-role client. Any failure (table missing, key unavailable) falls
// back to 'auto' — the theme must never break page rendering.
//
// The read is wrapped in unstable_cache (30s revalidate) because the
// root layout asks for it on EVERY page render — without the cache that
// was one service-role round trip per navigation for a value that
// changes only when the owner flips the admin toggle. Accepted
// trade-off: after a toggle, pages may keep showing the previous mode
// for up to ~30 seconds.

const readDiwaliMode = unstable_cache(
  async (): Promise<DiwaliMode> => {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "diwali_mode")
        .maybeSingle();
      if (error || !data) return "auto";
      const value: string = data.value;
      return isDiwaliMode(value) ? value : "auto";
    } catch {
      return "auto";
    }
  },
  ["diwali-mode"],
  { revalidate: 30, tags: ["diwali-mode"] },
);

export async function getDiwaliMode(): Promise<DiwaliMode> {
  return readDiwaliMode();
}

export async function isDiwaliLive(): Promise<boolean> {
  const mode = await getDiwaliMode();
  return diwaliLive(mode);
}

export async function setDiwaliMode(mode: DiwaliMode): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: "diwali_mode", value: mode, updated_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}
