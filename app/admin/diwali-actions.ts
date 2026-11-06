"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";
import { isDiwaliMode } from "@/lib/diwali";
import { setDiwaliMode } from "@/lib/server/diwali-settings";

// Owner/admin toggle for the Diwali theme mode (auto | on | off).
// Re-checks the Admin Pass server-side; the /admin page is also gated by
// middleware, but actions never trust the page gate alone.
export async function setDiwaliModeAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!passesAdminGate(user.email, account)) return;

  const raw: FormDataEntryValue | null = formData.get("mode");
  const mode: string = typeof raw === "string" ? raw : "";
  if (!isDiwaliMode(mode)) return;

  await setDiwaliMode(mode);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/login");
}
