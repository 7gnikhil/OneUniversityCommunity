// Canonical site origin for auth redirects.
//
// OAuth (Google) and password-reset flows must start AND finish on the same
// origin: the PKCE code-verifier cookie is set on the origin where sign-in
// starts, and Supabase sends the browser back to the redirectTo origin. If a
// visitor lands on a Vercel alias domain (…-7gnikhils-projects.vercel.app)
// while redirects point at the canonical domain — or vice versa — the
// verifier cookie is missing at /auth/callback and the exchange fails.
// NEXT_PUBLIC_SITE_URL pins every auth redirect to the canonical origin no
// matter which alias served the page; without it we fall back to the
// current origin (previous behaviour).
export function canonicalOrigin(fallback: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }
  return fallback.replace(/\/+$/, "");
}
