// Local-first session resolution for middleware, pages and polling
// actions — the hot paths that used to pay a full Supabase Auth server
// round trip (auth.getUser()) on EVERY request just to learn who is
// signed in.
//
// Strategy: try auth.getClaims() first. getClaims verifies the access
// token's signature LOCALLY against the project's JWKS and returns the
// JWT claims — no network call to the Auth server. Any situation where
// the claims cannot be produced (method missing, bad/expired token,
// verification failure) falls back to auth.getUser(), which is also the
// call that performs the session-cookie refresh in middleware.
//
// Version reality check (2026-11-07): package.json declares
// @supabase/supabase-js ^2.47.10, and getClaims only exists in
// supabase-js >= 2.57. There is NO lockfile in this repo, so the version
// Vercel installs for the caret range is not pinned — getClaims is
// therefore FEATURE-DETECTED at runtime instead of being called (and
// typed) directly. On an install without it, this helper degrades to
// exactly the old getUser() behaviour.
//
// Project-key caveat: local verification needs the project's asymmetric
// JWT signing keys (ECC/RSA). A project still on the legacy HS256 shared
// secret cannot serve a JWKS verification — getClaims errors there, and
// the getUser() fallback keeps behaviour identical.
//
// Deliberately NOT done here: pages/actions that mutate data keep using
// auth.getUser() (see the callers) — this helper is for read-hot paths
// where the { id, email } pair is all the caller needs before loading
// the app account row.

import type { SupabaseClient } from "@supabase/supabase-js";

// The slice of the auth user the read-hot paths actually consume:
// the auth user id (to resolve the accounts row) and the email (the
// admin gate + owner checks key on it). Mirrors what callers previously
// read off the User object from auth.getUser().
export interface SessionUser {
  id: string;
  email: string | null;
}

interface ClaimsShape {
  sub?: unknown;
  email?: unknown;
}

interface GetClaimsResult {
  data: { claims: ClaimsShape } | null;
  error: unknown;
}

type GetClaimsFn = () => Promise<GetClaimsResult>;

async function sessionUserFromClaims(
  supabase: SupabaseClient,
): Promise<SessionUser | null> {
  const auth = supabase.auth as { getClaims?: unknown };
  if (typeof auth.getClaims !== "function") return null;
  try {
    const getClaims = auth.getClaims as GetClaimsFn;
    const { data, error } = await getClaims.call(supabase.auth);
    if (error || !data?.claims) return null;
    const { sub, email } = data.claims;
    if (typeof sub !== "string" || sub.length === 0) return null;
    return {
      id: sub,
      email: typeof email === "string" ? email : null,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(
  supabase: SupabaseClient,
): Promise<SessionUser | null> {
  const fromClaims = await sessionUserFromClaims(supabase);
  if (fromClaims) return fromClaims;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { id: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}
