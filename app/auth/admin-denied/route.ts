import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing for a failed admin-entry check (/admin/check): the Google
// account that just signed in has no admin role, so sign it straight back
// out — a non-admin session must not linger from an admin sign-in attempt —
// and return to the admin login page with the reason.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    new URL("/admin/login?error=not-admin", request.url),
  );
}
