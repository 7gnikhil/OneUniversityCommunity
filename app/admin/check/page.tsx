import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";

// Post-Google checkpoint for the admin entry. The user IS authenticated at
// this point (that part is never skipped); this page only decides whether
// the account may use the admin area:
//   - pass  -> /admin
//   - fail  -> /auth/admin-denied, which signs the session out and explains
// The check itself (role on the account row / owner recognition) happens in
// lib/auth/account + lib/server/owner — entirely server-side.
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
    redirect("/admin");
  }
  redirect("/auth/admin-denied");
}
