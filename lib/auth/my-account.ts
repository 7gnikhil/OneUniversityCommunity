// Request-scoped session + account resolution for Server Components.
//
// React cache() memoises per request render: the root layout, the page
// and any nested server component that ask for "my account" during one
// render share a single session resolution + accounts lookup instead of
// each paying for its own. The cache key is the Supabase client
// instance, and each request builds exactly one (lib/supabase/server),
// so within a request this is a true dedupe; across requests nothing is
// shared (cache() is request-scoped by design).
//
// SERVER COMPONENTS ONLY: cache() has no meaning in middleware or route
// handlers — middleware uses getSessionUser (lib/auth/session) directly.

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccountByAuthUserId,
  type AccountRow,
} from "@/lib/auth/account";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

export const getMySessionUser = cache(
  async (supabase: SupabaseClient): Promise<SessionUser | null> =>
    getSessionUser(supabase),
);

// Session user -> app account row, once per request. Returns null in
// exactly the cases the old getUser() + getAccountByAuthUserId chain
// returned null: signed out, or signed in without an accounts row yet
// (callers render their "finish sign-up" states for both).
export const getMyAccount = cache(
  async (supabase: SupabaseClient): Promise<AccountRow | null> => {
    const sessionUser = await getMySessionUser(supabase);
    if (!sessionUser) return null;
    return getAccountByAuthUserId(supabase, sessionUser.id);
  },
);
