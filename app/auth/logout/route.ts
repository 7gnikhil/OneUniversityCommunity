import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign-out: invalidate the session server-side (the refresh token is
// revoked at Supabase) and clear the session cookies, then return to the
// login page. With the cookies gone there is no silent re-entry — the
// middleware gate sends the next visit to /login.
async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

export async function GET(request: NextRequest) {
  return signOut(request);
}
