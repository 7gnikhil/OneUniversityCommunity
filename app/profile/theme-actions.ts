"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { isThemeId } from "@/lib/themes";
import { isDialSkinId, type DialSkinId } from "@/lib/dial-skins";

// The signed-in user's own interface pick (profiles.theme_id,
// migration 0008) — saved by the dial's long-press interface mode and
// by the interface list in Profile settings. Resolution (root layout):
// this pick > the admin's app-wide default > seasonal auto. A null
// pick means "follow the app default". Session client throughout, so
// the profiles RLS owner-only policy enforces whose row can change;
// the actor always comes from the session, never from the request.

export async function setMyThemeAction(
  themeId: string | null,
): Promise<boolean> {
  const pick = themeId !== null && isThemeId(themeId) ? themeId : null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const account = await getAccountByAuthUserId(supabase, user.id);
    if (!account) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ theme_id: pick })
      .eq("account_id", account.id);
    if (error) return false;
    // The stamp lives in the root layout — revalidate it app-wide so
    // the saver's next navigation renders the pick server-side too
    // (the dial already previewed it live on the client).
    revalidatePath("/", "layout");
    return true;
  } catch {
    return false;
  }
}

/** Form variant for the Profile settings interface list. */
export async function setMyThemeFormAction(formData: FormData): Promise<void> {
  const raw = formData.get("themeId");
  const themeId = typeof raw === "string" && raw !== "" ? raw : null;
  await setMyThemeAction(themeId);
  revalidatePath("/profile");
}

// ── Dial wheel skin (profiles.dial_skin, migration 0010) ─────────────
// The dial's OWN look, independent of the interface: saved by the
// dial's long-press wheel-style mode and by the wheel list in Profile
// settings. 'auto' = the wheel wears the applied interface's skin.
// Same session-client discipline as the theme pick above; fail-soft
// (a missing column pre-migration just returns false — the dial has
// already applied the pick optimistically on the client).

export async function setMyDialSkinAction(
  skinId: DialSkinId,
): Promise<boolean> {
  const pick: DialSkinId = isDialSkinId(skinId) ? skinId : "auto";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const account = await getAccountByAuthUserId(supabase, user.id);
    if (!account) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ dial_skin: pick })
      .eq("account_id", account.id);
    if (error) return false;
    // The dial renders from the root layout's data — revalidate
    // app-wide so the saver's next navigation wears the pick too.
    revalidatePath("/", "layout");
    return true;
  } catch {
    return false;
  }
}

/** Form variant for the Profile settings wheel-style list. */
export async function setMyDialSkinFormAction(
  formData: FormData,
): Promise<void> {
  const raw = formData.get("dialSkinId");
  await setMyDialSkinAction(isDialSkinId(raw) ? raw : "auto");
  revalidatePath("/profile");
}

/**
 * The one-time dial tip's dismissal (profiles.dial_tip_seen,
 * migration 0010): flipped by the home card's "Got it" and never
 * unset. Fail-soft like everything here — if the write fails the
 * card's client state still hides it for the session, and the
 * fail-closed read (getProfileDialTipSeen → null on error) keeps it
 * from re-appearing spuriously on erroring reads.
 */
export async function markDialTipSeenAction(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const account = await getAccountByAuthUserId(supabase, user.id);
    if (!account) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ dial_tip_seen: true })
      .eq("account_id", account.id);
    return !error;
  } catch {
    return false;
  }
}
