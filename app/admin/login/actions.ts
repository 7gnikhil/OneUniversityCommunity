"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
//
// Brute-force hardening (migration 0005): failed attempts are recorded
// per (email, ip) in public.admin_login_attempts via the service-role
// client. 8 failures inside 15 minutes locks the pair out. EVERY failure
// — unknown email, wrong password, correct password on a non-admin
// account, empty fields, or a throttled pair — returns the one generic
// message below, so the response never reveals which case happened,
// whether the account exists, or that throttling exists.
const GENERIC_ERROR = "Invalid email or password.";

const THROTTLE_LIMIT = 8;
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

async function clientIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

function windowStartIso(): string {
  return new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
}

// The throttle store is best-effort: if the table is unavailable (e.g.
// migration 0005 not applied yet in this environment) the helpers below
// quietly no-op rather than locking the owner out of the admin door.
async function recentFailureCount(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  ip: string,
): Promise<number> {
  try {
    const { count, error } = await admin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("ip", ip)
      .gte("attempted_at", windowStartIso());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function recordFailure(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  ip: string,
): Promise<void> {
  try {
    await admin.from("admin_login_attempts").insert({ email, ip });
  } catch {
    // Best-effort only — see recentFailureCount.
  }
}

async function clearFailures(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  ip: string,
): Promise<void> {
  try {
    await admin
      .from("admin_login_attempts")
      .delete()
      .eq("email", email)
      .eq("ip", ip)
      .gte("attempted_at", windowStartIso());
  } catch {
    // Best-effort only — see recentFailureCount.
  }
}

export async function adminLoginAction(
  _prevState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: GENERIC_ERROR };
  }

  const ip = await clientIp();
  const admin = createAdminClient();

  // Throttle check BEFORE the password is tried: a locked pair gets the
  // generic error without a sign-in attempt (and without a new attempt
  // row, so the lock simply ages out 15 minutes after the last failure).
  if ((await recentFailureCount(admin, email, ip)) >= THROTTLE_LIMIT) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    await recordFailure(admin, email, ip);
    return { error: GENERIC_ERROR };
  }

  const account = await getAccountByAuthUserId(supabase, data.user.id);
  if (!passesAdminGate(data.user.email, account)) {
    // The password was correct but this is not an admin account: sign
    // straight back out and answer EXACTLY like a wrong password, so
    // the response cannot confirm the password was right.
    await recordFailure(admin, email, ip);
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }

  await clearFailures(admin, email, ip);

  // The checkpoint creates the owner/admin account row on first pass
  // (bootstrap) and lands on /admin.
  redirect("/admin/check");
}
