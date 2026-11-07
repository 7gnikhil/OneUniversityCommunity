import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";

// Shared guard for the /admin/* pages: resolves the session, requires the
// Admin Pass (passesAdminGate — only the owner's own email passes), and
// hands back the service-role client the queues read through. Middleware
// gates these routes as well; this is the page-level belt to that braces.
export interface AdminPageCtx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
}

export async function requireAdminPage(): Promise<AdminPageCtx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account || !passesAdminGate(user.email, account)) {
    redirect("/auth/admin-denied");
  }
  return { account, admin: createAdminClient() };
}
