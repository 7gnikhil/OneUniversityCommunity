import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Session-aware server client (anon key + the user's auth cookie).
// Use in Server Components, Route Handlers and Server Actions for anything
// that acts as the signed-in user — RLS applies.
//
// Wrapped in React cache(): ONE client instance per request, shared by
// the root layout, the page and every nested server component. This is
// load-bearing for the request-scoped memoisation in
// lib/auth/my-account (getMySessionUser / getMyAccount) and
// lib/dial-badges (getDialData): their cache() keys include the client
// object, so when every caller built its own client, every cache
// missed and the same session/account/badge queries ran two or three
// times per render. The client is a thin cookie-backed wrapper, so
// sharing it within a request changes nothing about what any caller
// reads or writes. (Middleware does not use this helper — it builds
// its own client in middleware.ts.)
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session (see middleware.ts TODO).
          }
        },
      },
    },
  );
});

// Service-role client — SERVER ONLY. Bypasses RLS.
// Reserved for: admin review decisions, verification pipeline writes,
// reveal-request resolution, Maya Jwalam moderation lookups (author
// identity), and the server-side owner-email check. NEVER import this from
// client code and never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
