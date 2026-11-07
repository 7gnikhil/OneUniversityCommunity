// SERVER-ONLY module. Never import this from a Client Component or from any
// file that is bundled for the browser: the owner address below is an
// authentication input, not UI content, and it must never be rendered,
// logged to the client, or shipped in a JS bundle.
//
// The rule it supports (checked on the server only): ONLY the owner's own
// email opens the admin gate (owner's rule, 2026-11-07 — "only my email id
// is only access to admin page"; no other email works, and an accounts.role
// of 'admin'/'owner' alone does NOT pass). This check is also what
// bootstraps the very first admin sign-in on a fresh database.

const OWNER_EMAIL = "7gnikhil@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}
