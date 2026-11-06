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
}

const ACCOUNT_COLUMNS =
  "id, auth_user_id, oneuco_id, username, email, phone, role, status";

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

// The Admin Pass gate: role 'owner'/'admin' on the account row, OR the
// owner's own email (server-side bootstrap for the first admin sign-in,
// see lib/server/owner.ts). Admin Pass skips student verification only —
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
// completed sign-up — callers treat null as "pending verification").
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
