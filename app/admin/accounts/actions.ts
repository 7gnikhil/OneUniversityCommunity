"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";

// Accounts-list actions. Same discipline as the other admin actions:
// the Admin Pass is re-checked server-side (never trusted from the
// page), then the write runs on the service role.

export interface AdminActionResult {
  error: string | null;
}

interface AdminCtx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
}

async function requireAdmin(): Promise<AdminCtx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  if (!passesAdminGate(user.email, account)) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  return { account, admin };
}

// Un-stick an account left in the legacy ID-review state: joining no
// longer involves ID review, so a pending_verification account is
// simply marked verified. The update is guarded on the current status
// — an account that already moved on (verified, suspended…) is never
// flipped by a stale click.
export async function markAccountVerifiedAction(
  accountId: string,
): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  if (typeof accountId !== "string" || accountId.length === 0) {
    return { error: "That account doesn't look right." };
  }
  const { error } = await ctx.admin
    .from("accounts")
    .update({ status: "verified" })
    .eq("id", accountId)
    .eq("status", "pending_verification");
  if (error) return { error: "Couldn't update that account — please try again." };
  revalidatePath("/admin/accounts");
  revalidatePath("/admin");
  return { error: null };
}
