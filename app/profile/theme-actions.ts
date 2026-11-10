"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { isThemeId } from "@/lib/themes";

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
