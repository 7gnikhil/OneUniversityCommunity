import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Session-aware server client (anon key + the user's auth cookie).
// Use in Server Components, Route Handlers and Server Actions for anything
// that acts as the signed-in user — RLS applies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
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
}

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
