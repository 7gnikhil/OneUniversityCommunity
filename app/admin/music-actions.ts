"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";
import { setMusicMitraEnabled } from "@/lib/server/music-settings";

// Owner/admin kill-switch for Music Mitra (2026-11-17). One flip in
// /admin: the Mitra tab hides, the player unmounts, /radio shows a
// paused notice and /api/radio answers 503 — no deploy needed.
// Re-checks the Admin Pass server-side; actions never trust the page
// gate alone (same pattern as diwali-actions).
export async function setMusicMitraEnabledAction(
  formData: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!passesAdminGate(user.email, account)) return;

  const raw: FormDataEntryValue | null = formData.get("enabled");
  if (raw !== "on" && raw !== "off") return;

  await setMusicMitraEnabled(raw === "on");
  revalidateTag("music-mitra-enabled");
  revalidatePath("/admin");
  revalidatePath("/radio");
  revalidatePath("/chirp");
}
