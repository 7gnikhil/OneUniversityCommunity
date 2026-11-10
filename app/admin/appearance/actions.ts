"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";
import { isThemeId, type ThemeSetting } from "@/lib/themes";
import { setThemeSetting } from "@/lib/server/theme-settings";

// Owner control for the app-wide DEFAULT interface (app_settings key
// 'theme'). Students who picked their own interface in the dial keep
// theirs — this is the default everyone else gets. Re-checks the Admin
// Pass server-side; the page gate alone is never trusted.
export async function setAppThemeAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!passesAdminGate(user.email, account)) return;

  const raw: FormDataEntryValue | null = formData.get("themeId");
  const value: string = typeof raw === "string" ? raw : "";
  const setting: ThemeSetting =
    value !== "auto" && isThemeId(value)
      ? { mode: "manual", id: value }
      : { mode: "auto" };

  await setThemeSetting(setting);
  revalidatePath("/admin/appearance");
  // The interface stamps in the root layout — refresh it app-wide.
  revalidatePath("/", "layout");
}
