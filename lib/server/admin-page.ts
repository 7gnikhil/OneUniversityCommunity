import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { passesAdminGate, type AccountRow } from "@/lib/auth/account";
import { getMyAccount, getMySessionUser } from "@/lib/auth/my-account";

// Shared guard for the /admin/* pages: resolves the session, requires the
// Admin Pass (passesAdminGate — only the owner's own email passes), and
// hands back the service-role client the queues read through. Middleware
// gates these routes as well; this is the page-level belt to that braces.
//
// Session + account resolution goes through lib/auth/my-account
// (getMySessionUser / getMyAccount) — the request-cached path the root
// layout already resolved for this same render. The previous version of
// this guard called supabase.auth.getUser() (a full Auth-server round
// trip) and then re-ran the accounts lookup the layout had just done,
// so EVERY admin page paid an extra network call + a duplicate query
// before its own first query could start. The cached path resolves the
// session locally (JWT claims, with getUser() as its built-in fallback
// inside getSessionUser) and reuses the layout's account row, so the
// guard now costs zero extra round trips in the steady state. Outcomes
// are identical: no session → /admin/login; no row or gate failure →
// /auth/admin-denied. (Admin server ACTIONS keep their own getUser()
// gate in app/admin/*actions.ts — mutation paths re-validate against
// the Auth server by the codebase's session doctrine; this guard is
// render-only.)
export interface AdminPageCtx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
}

export async function requireAdminPage(): Promise<AdminPageCtx> {
  const supabase = await createClient();
  const user = await getMySessionUser(supabase);
  if (!user) redirect("/admin/login");
  const account = await getMyAccount(supabase);
  if (!account || !passesAdminGate(user.email, account)) {
    redirect("/auth/admin-denied");
  }
  return { account, admin: createAdminClient() };
}
