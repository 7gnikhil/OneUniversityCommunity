"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/server/owner";
import { canonicalOrigin } from "@/lib/site";

export interface AdminRecoveryState {
  submitted: boolean;
}

// Admin password recovery (owner rule, 2026-11-07): a reset link for the
// ADMIN door is emailed ONLY for the owner's own address. Any other
// email silently sends nothing — and the action returns the exact same
// state either way, so the page's neutral confirmation never reveals
// which addresses can recover the admin account. (Students keep the
// shared /forgot-password flow; this page is separate and admin-only.)
export async function adminForgotPasswordAction(
  _prevState: AdminRecoveryState,
  formData: FormData,
): Promise<AdminRecoveryState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email && isOwnerEmail(email)) {
    try {
      const headerStore = await headers();
      const proto = headerStore.get("x-forwarded-proto") ?? "https";
      const host =
        headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
      const fallback = host ? `${proto}://${host}` : "";
      const supabase = await createClient();
      // Same landing as the student flow: the link returns via
      // /auth/callback and continues to /reset-password.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${canonicalOrigin(fallback)}/auth/callback?next=/reset-password`,
      });
    } catch {
      // Identical outward behaviour whether the send worked or not.
    }
  }

  return { submitted: true };
}
