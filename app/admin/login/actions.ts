"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
} from "@/lib/auth/account";

export interface AdminLoginState {
  error: string | null;
}

// Admin entry is mail + password only (owner decision 2026-11-07: no
// Google on the admin door). Authentication is the normal Supabase
// password sign-in; authorisation is the Admin Pass check immediately
// after — a successfully authenticated NON-admin is signed straight back
// out here, before any admin page renders.
const GENERIC_ERROR =
  "Those details don't match an admin account. Check the email and password, then try again.";

export async function adminLoginAction(
  _prevState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter the admin email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return { error: GENERIC_ERROR };

  const account = await getAccountByAuthUserId(supabase, data.user.id);
  if (!passesAdminGate(data.user.email, account)) {
    await supabase.auth.signOut();
    return {
      error:
        "That account doesn't have an admin role, so it was signed back out. This entry is only for the OneUCo Developer and appointed admins.",
    };
  }

  // The checkpoint creates the owner/admin account row on first pass
  // (bootstrap) and lands on /admin.
  redirect("/admin/check");
}
