import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
} from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Session refresh + route gates.
//
// Gate rules (the TODO from the scaffold, now implemented):
//   - no session             -> /login (auth pages stay reachable)
//   - session + not verified -> only /verify (verification-pending shell)
//                               and sign-out are reachable
//   - /admin                 -> session + Admin Pass (ONLY the owner's
//                               own email passes — checked server-side
//                               in lib/auth/account / lib/server/owner)
//   - Admin Pass holders are never held at the verification gate.
export async function middleware(request: NextRequest) {
  // Stamp the route on the request headers so server components can
  // gate on it — components/DialShellServer reads x-pathname to skip
  // the dial-data computation (getDialData) under /admin. Set before
  // the first NextResponse.next({ request }) so every response built
  // from this request (including the setAll recreations below)
  // forwards it.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Session resolution: local JWT claims first (getSessionUser verifies
  // the token against the project JWKS — no Auth-server round trip on
  // the every-request path). Whenever the token can't be validated
  // locally it falls back to supabase.auth.getUser(), which is also the
  // call that refreshes the auth session cookie when a refresh is due —
  // so cookie rotation still happens exactly when it used to matter.
  const user = await getSessionUser(supabase);

  const { pathname } = request.nextUrl;

  // Redirects must carry any refreshed session cookies, or the browser
  // would lose the just-rotated tokens.
  function redirect(path: string, next?: string): NextResponse {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (next) url.searchParams.set("next", next);
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie);
    });
    return res;
  }

  // Route handlers under /auth (OAuth callback, sign-out, admin-denied)
  // manage their own session state — never gate them here.
  if (pathname.startsWith("/auth/")) return response;

  // Keep-warm probe: exercises the server + database read path for the
  // cron pinger. It exposes nothing (returns only {ok:true}) — never gate.
  if (pathname === "/api/warm") return response;

  // Crawler rules are public by definition (app/robots.ts) — gating
  // them behind the session redirect is what made /robots.txt return
  // the app's HTML in the first place.
  if (pathname === "/robots.txt") return response;

  const PUBLIC_AUTH_PAGES: string[] = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/admin/login",
    "/admin/forgot-password",
    // Public legal pages: readable signed-out (Google OAuth branding links
    // to /privacy, and students should read both before signing up).
    "/privacy",
    "/terms",
  ];

  if (!user) {
    if (PUBLIC_AUTH_PAGES.includes(pathname)) return response;
    return redirect("/login", pathname === "/" ? undefined : pathname);
  }

  // Signed in. Resolve the app account (null = row not created/linked yet,
  // e.g. a brand-new Google sign-in — treated as pending verification).
  const account = await getAccountByAuthUserId(supabase, user.id);
  const admin = passesAdminGate(user.email, account);
  const verified = admin || account?.status === "verified";

  // Admin sign-in flow pages decide for themselves.
  if (
    pathname === "/admin/login" ||
    pathname === "/admin/check" ||
    pathname === "/admin/forgot-password"
  ) {
    return response;
  }
  if (pathname.startsWith("/admin")) {
    return admin ? response : redirect("/swipe");
  }

  // Signed-in users don't need the login/sign-up/forgot pages again.
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password"
  ) {
    return redirect(verified ? "/swipe" : "/verify");
  }
  // Reached WITH a (recovery) session from the email link — always allowed.
  if (pathname === "/reset-password") return response;

  // Verification gate: pending / unverified students live in the shell.
  if (!verified) {
    return pathname === "/verify" ? response : redirect("/verify");
  }

  // Landing rule (2026-11-11): the app opens on Fling. A verified
  // user asking for the root goes straight to the deck; the dial
  // home lives at /home.
  if (pathname === "/") {
    return redirect("/swipe");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
