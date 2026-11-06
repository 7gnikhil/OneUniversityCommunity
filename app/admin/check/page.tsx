import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  ensureAdminAccount,
  getAccountByAuthUserId,
  passesAdminGate,
} from "@/lib/auth/account";

// Post-Google checkpoint for the admin entry. The user IS authenticated at
// this point (that part is never skipped); this page only decides whether
// the account may use the admin area:
//   - pass  -> /admin
//   - fail  -> /auth/admin-denied, which signs the session out and explains
// The check itself (role on the account row / owner recognition) happens in
// lib/auth/account + lib/server/owner — entirely server-side.
//
// Bootstrap: a passing user may still have NO accounts row (the owner is
// recognised by email before any row exists, and account completion lives
// on /verify, which Admin Pass accounts skip). This page is the single
// bootstrap point: ensureAdminAccount creates the owner/admin row + empty
// profile on the first admin sign-in. Middleware stays read-only and never
// creates rows.
export default async function AdminCheckPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login?error=session");
  }

  const account = await getAccountByAuthUserId(supabase, user.id);

  if (passesAdminGate(user.email, account)) {
    if (!account && user.email) {
      const email: string = user.email;
      try {
        const admin = createAdminClient();
        await ensureAdminAccount(admin, {
          id: user.id,
          email,
          user_metadata: user.user_metadata,
        });
      } catch {
        // Service role unavailable in this environment. A bootstrap
        // failure must never lock out an account the gate just approved —
        // the row creation is simply retried on the next admin sign-in,
        // and /admin explains the missing row in the meantime.
      }
    }
    redirect("/admin");
  }
  redirect("/auth/admin-denied");
}
