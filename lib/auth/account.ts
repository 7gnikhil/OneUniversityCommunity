// Account lookups shared by middleware, server pages and server actions.
//
// `accounts` is the app's own identity table (see supabase/schema.sql); the
// Supabase Auth user is linked to it via `auth_user_id`. Two kinds of
// lookups live here:
//   - session lookups (RLS applies: a signed-in user can read their own row)
//   - pre-auth identifier resolution for password login, which MUST use the
//     service-role client because there is no session yet (RLS would —
//     correctly — return nothing to an anonymous caller).
//
// This file is server-only by usage: it is imported by middleware, Server
// Components, Route Handlers and Server Actions, never by Client
// Components.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, Role } from "@/lib/types";
import { isOwnerEmail } from "@/lib/server/owner";
import { generateOneucoId } from "@/lib/validation";

// Shape of the columns of public.accounts this app reads. (Hand-typed until
// generated database types land — see lib/types.ts.)
export interface AccountRow {
  id: string;
  auth_user_id: string | null;
  oneuco_id: string;
  username: string;
  email: string;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  // Self-declared at profile completion. These stay on the private accounts
  // row and are never part of public_profiles.
  college_name: string | null;
  college_code: string | null;
  branch: string | null;
  graduation_year: number | null;
}

const ACCOUNT_COLUMNS =
  "id, auth_user_id, oneuco_id, username, email, phone, role, status, college_name, college_code, branch, graduation_year";

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

// The Admin Pass gate: role 'owner'/'admin' on the account row, OR the
// owner's own email (server-side bootstrap for the first admin sign-in,
// see lib/server/owner.ts). Admin Pass skips student profile completion only —
// the caller must already be authenticated; this function never replaces
// authentication.
export function passesAdminGate(
  email: string | null | undefined,
  account: AccountRow | null,
): boolean {
  return isOwnerEmail(email) || isAdminRole(account?.role);
}

// Session lookup: the account row belonging to this auth user, or null when
// the row doesn't exist yet (e.g. a first-time Google sign-in that has not
// completed sign-up — callers treat null as "profile not completed yet").
export async function getAccountByAuthUserId(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<AccountRow | null> {
  const { data } = await supabase
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data ?? null) as AccountRow | null;
}

// Pre-auth identifier resolution for password login. Accepts any of:
// OneUco ID, username, email, phone. Uses the service-role client.
// Returns the matched account row (whose `email` is then used for the
// Supabase Auth password sign-in), or null when nothing matches.
export async function resolveAccountByIdentifier(
  admin: SupabaseClient,
  rawIdentifier: string,
): Promise<AccountRow | null> {
  const identifier = rawIdentifier.trim();
  if (!identifier) return null;

  async function lookup(
    column: "email" | "username" | "oneuco_id" | "phone",
    value: string,
  ): Promise<AccountRow | null> {
    const { data } = await admin
      .from("accounts")
      .select(ACCOUNT_COLUMNS)
      .eq(column, value)
      .maybeSingle();
    return (data ?? null) as AccountRow | null;
  }

  // Email — stored lowercase; match the login form's input case-insensitively
  // by normalising here (sign-up stores emails trimmed + lowercased).
  if (identifier.includes("@")) {
    const byEmail = await lookup("email", identifier.toLowerCase());
    if (byEmail) return byEmail;
  }

  // OneUco ID — short human ID like "UC" + 6 chars; stored uppercase.
  const byOneucoId = await lookup("oneuco_id", identifier.toUpperCase());
  if (byOneucoId) return byOneucoId;

  // Username — the @handle; stored lowercase at claim time.
  const byUsername = await lookup("username", identifier.toLowerCase());
  if (byUsername) return byUsername;

  // Phone — compare on digits only so "+91 98..." style input still matches
  // a digits-only stored value.
  const digits = identifier.replace(/\D/g, "");
  if (digits.length >= 10) {
    const byPhone = await lookup("phone", digits);
    if (byPhone) return byPhone;
  }

  return null;
}

// ── Admin bootstrap ────────────────────────────────────────────────────────
// The admin entry (/admin/check) can pass the gate for a user who has NO
// accounts row yet: the owner is recognised by email (lib/server/owner.ts)
// before any row exists, and the normal account-completion step lives on
// /verify, which Admin Pass accounts skip. Without a row the admin has no
// OneUco ID, no username and no profile — so the row is created here, on
// the first admin sign-in, by the service-role client passed in.
//
// The new row is born `verified`: the Admin Pass IS the activation for
// these accounts (it skips student profile completion only — authentication
// already happened before this runs). Idempotent: an existing row is
// returned untouched, so the bootstrap username below is just a default
// the owner can change later.

export interface AdminBootstrapUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown> | null;
}

// Username base derived from the email local-part, sanitised to the handle
// rules (see lib/validation): lowercase letters/digits/underscore, starts
// with a letter, 3–20 chars. Capped at 16 so a numeric collision suffix
// still fits the 20-char limit.
function adminUsernameBase(email: string): string {
  const local = email.split("@")[0] ?? "";
  let base = local.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z]/.test(base)) base = `u${base}`;
  if (base.length < 3) base = base.padEnd(3, "_");
  return base.slice(0, 16);
}

export async function ensureAdminAccount(
  admin: SupabaseClient,
  user: AdminBootstrapUser,
): Promise<AccountRow | null> {
  const existing = await getAccountByAuthUserId(admin, user.id);
  if (existing) return existing;

  const authUserId: string = user.id;
  const email: string = user.email.trim().toLowerCase();
  const role: Role = isOwnerEmail(email) ? "owner" : "admin";
  const base = adminUsernameBase(email);

  let usernameSuffix = 0;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const username =
      usernameSuffix === 0 ? base : `${base}${usernameSuffix}`;
    const { data: inserted, error } = await admin
      .from("accounts")
      .insert({
        auth_user_id: authUserId,
        oneuco_id: generateOneucoId(),
        username,
        email,
        role,
        status: "verified",
      })
      .select(ACCOUNT_COLUMNS)
      .single();

    if (!error && inserted) {
      const account = inserted as AccountRow;
      await ensureAdminProfileRow(admin, account, user.user_metadata);
      return account;
    }

    const message = error?.message ?? "";
    if (message.includes("accounts_username_key")) {
      usernameSuffix += 1;
      continue;
    }
    if (message.includes("accounts_oneuco_id_key")) {
      continue; // same username candidate, fresh ID next attempt
    }
    if (
      message.includes("accounts_email_key") ||
      message.includes("accounts_auth_user_id_key")
    ) {
      // A concurrent bootstrap, or an older row created before it was
      // linked to this auth user, got there first.
      const raced = await getAccountByAuthUserId(admin, authUserId);
      if (raced) return raced;
      return linkAdminAccountByEmail(admin, user, email);
    }
    return null;
  }
  return null;
}

// Fallback for the bootstrap race: an accounts row with this email exists
// but was never linked to an auth user (auth_user_id NULL). Link it to
// this admin sign-in and make sure it carries an admin role + verified
// status. A row linked to a DIFFERENT auth user is never hijacked.
async function linkAdminAccountByEmail(
  admin: SupabaseClient,
  user: AdminBootstrapUser,
  email: string,
): Promise<AccountRow | null> {
  const { data } = await admin
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("email", email)
    .maybeSingle();
  const row = (data ?? null) as AccountRow | null;
  if (!row || row.auth_user_id !== null) return null;

  const role: Role = isOwnerEmail(email)
    ? "owner"
    : isAdminRole(row.role)
      ? row.role
      : "admin";
  const { data: updated, error } = await admin
    .from("accounts")
    .update({ auth_user_id: user.id, role, status: "verified" })
    .eq("id", row.id)
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error || !updated) return null;

  const account = updated as AccountRow;
  await ensureAdminProfileRow(admin, account, user.user_metadata);
  return account;
}

// profiles.name is NOT NULL; the bootstrap profile starts with the name
// from the auth provider (Google supplies one) or blank — editable on
// /profile. Mirrors the helper in app/verify/actions.ts, which is local to
// its 'use server' file and so cannot be imported from here.
async function ensureAdminProfileRow(
  admin: SupabaseClient,
  account: AccountRow,
  userMetadata: Record<string, unknown> | null | undefined,
): Promise<void> {
  const { data } = await admin
    .from("profiles")
    .select("account_id")
    .eq("account_id", account.id)
    .maybeSingle();
  if (data) return;
  const metaName =
    typeof userMetadata?.full_name === "string"
      ? userMetadata.full_name
      : typeof userMetadata?.name === "string"
        ? userMetadata.name
        : "";
  await admin.from("profiles").insert({
    account_id: account.id,
    name: metaName,
  });
}
