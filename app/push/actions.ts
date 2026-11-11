"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";

// Push subscription writes (re-engagement batch, 2026-11-11).
// The browser hands its PushSubscription JSON to subscribe; the row
// is written with the SERVICE-ROLE client because push_subscriptions
// has RLS enabled with no client policies (migration 0013) — an
// endpoint is a capability URL for reaching someone's device and
// must never be readable by other clients.

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

async function requireAdminAndAccount(): Promise<{
  admin: ReturnType<typeof createAdminClient>;
  accountId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  try {
    return { admin: createAdminClient(), accountId: account.id };
  } catch {
    return null;
  }
}

export async function subscribePushAction(
  input: PushSubscriptionInput,
): Promise<{ ok: boolean }> {
  const endpoint = input?.endpoint?.trim() ?? "";
  const p256dh = input?.p256dh?.trim() ?? "";
  const auth = input?.auth?.trim() ?? "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return { ok: false };
  }
  const ctx = await requireAdminAndAccount();
  if (!ctx) return { ok: false };

  // Upsert on the endpoint: a device that changes hands (or a browser
  // profile that gets signed into a different account) rebinds its
  // subscription to the account that just granted it.
  const { error } = await ctx.admin.from("push_subscriptions").upsert(
    {
      account_id: ctx.accountId,
      endpoint,
      p256dh,
      auth,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  return { ok: !error };
}

export async function unsubscribePushAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  if (!endpoint?.startsWith("https://")) return { ok: false };
  const ctx = await requireAdminAndAccount();
  if (!ctx) return { ok: false };
  const { error } = await ctx.admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("account_id", ctx.accountId);
  return { ok: !error };
}
