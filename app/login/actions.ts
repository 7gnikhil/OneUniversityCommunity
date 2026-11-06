"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  resolveAccountByIdentifier,
  type AccountRow,
} from "@/lib/auth/account";

export interface LoginState {
  error: string | null;
}

// One message for "no such account" and "wrong password" alike — the form
// must not reveal which identifiers are registered.
const GENERIC_ERROR =
  "Those details don't match an account. Check your OneUco ID, username, email or phone — and your password — then try again.";

function safeNext(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// Password login. The identifier (OneUco ID / username / email / phone) is
// resolved against public.accounts with the service-role client (there is
// no session yet, so RLS would hide every row); the account's email then
// drives the real Supabase Auth password sign-in, which sets the session
// cookies. Attempt counting / lockout messaging lives in the form
// component for this slice (see LoginForm.tsx) — a server-side rate limit
// is a hardening TODO before public launch.
export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!identifier.trim() || !password) {
    return { error: "Enter your identifier and your password." };
  }

  let account: AccountRow | null = null;
  try {
    const adminClient = createAdminClient();
    account = await resolveAccountByIdentifier(adminClient, identifier);
  } catch {
    // Service-role key missing/misconfigured in this environment.
    return {
      error: "Password login isn't fully configured yet. Try Continue with Google, or try again later.",
    };
  }
  if (!account) return { error: GENERIC_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password,
  });
  if (error || !data.user) return { error: GENERIC_ERROR };

  // Land the new session where the gates would send it anyway (middleware
  // enforces the same rules on every request).
  const fresh = await getAccountByAuthUserId(supabase, data.user.id);
  const row = fresh ?? account;
  const admin = passesAdminGate(data.user.email, row);
  const verified = admin || row.status === "verified";

  if (!verified) redirect("/verify");
  redirect(next ?? "/");
}
