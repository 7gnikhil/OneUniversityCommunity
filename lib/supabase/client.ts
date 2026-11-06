import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (anon key). All data access is constrained by the
// Row Level Security policies in supabase/schema.sql — the anon key alone
// grants nothing beyond what those policies allow.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
