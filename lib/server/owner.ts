// SERVER-ONLY module. Never import this from a Client Component or from any
// file that is bundled for the browser: the owner address below is an
// authentication input, not UI content, and it must never be rendered,
// logged to the client, or shipped in a JS bundle.
//
// The rule it supports (checked on the server only): the app owner's own
// Google account is recognised as the owner even before an `accounts` row
// has been linked to that auth user — this is what bootstraps the very
// first admin sign-in on a fresh database. Everyone else's admin access
// comes from `accounts.role` ('owner' | 'admin'), never from their email.

const OWNER_EMAIL = "7gnikhil@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}
