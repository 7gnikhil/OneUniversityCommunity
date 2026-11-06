import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) + password-reset landing. Supabase redirects here with a
// one-time `code`; exchange it for a session cookie, then continue to
// `next` (a same-site path only — open redirects are refused).

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Self-diagnosing failure path: log the exact reason server-side and
    // carry a short sanitised code to the login banner so a screenshot of
    // the failure identifies it (e.g. PKCE verifier problems show up here).
    console.error("[auth/callback] code exchange failed:", error.code ?? error.name, error.message);
    const reason = (error.code ?? "exchange").replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "exchange";
    return NextResponse.redirect(`${origin}/login?error=auth&reason=${reason}`);
  }

  console.error("[auth/callback] landed without a code");
  return NextResponse.redirect(`${origin}/login?error=auth&reason=nocode`);
}
