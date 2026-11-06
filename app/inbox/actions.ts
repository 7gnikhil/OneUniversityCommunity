"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";

// Inbox actions for group invites. (Reveal accept/decline/revoke live in
// app/servers/reveal-actions.ts next to the Jwalam rules they enforce.)
// Accepting adds me to the server and retires the invite; declining just
// retires it. Both run on the service role after identity checks —
// group_invites has no invitee-side write policy by design.

async function requireCtx(): Promise<{
  accountId: string;
  admin: ReturnType<typeof createAdminClient>;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  return { accountId: account.id, admin };
}

interface InviteRow {
  id: string;
  server_id: string;
  invitee_account_id: string | null;
}

async function loadMyInvite(
  admin: ReturnType<typeof createAdminClient>,
  inviteId: string,
  myAccountId: string,
): Promise<InviteRow | null> {
  const { data } = await admin
    .from("group_invites")
    .select("id, server_id, invitee_account_id")
    .eq("id", inviteId)
    .maybeSingle();
  const invite = (data ?? null) as InviteRow | null;
  if (!invite || invite.invitee_account_id !== myAccountId) return null;
  return invite;
}

export async function acceptInviteAction(
  inviteId: string,
): Promise<{ error: string | null; serverId: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again.", serverId: null };
  const invite = await loadMyInvite(ctx.admin, inviteId, ctx.accountId);
  if (!invite) return { error: "That invite is gone.", serverId: null };

  const { error } = await ctx.admin.from("server_members").upsert(
    { server_id: invite.server_id, account_id: ctx.accountId, role: "member" },
    { onConflict: "server_id,account_id", ignoreDuplicates: true },
  );
  if (error) return { error: "Couldn't join — please try again.", serverId: null };
  await ctx.admin.from("group_invites").delete().eq("id", inviteId);
  return { error: null, serverId: invite.server_id };
}

export async function declineInviteAction(
  inviteId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "Please sign in again." };
  const invite = await loadMyInvite(ctx.admin, inviteId, ctx.accountId);
  if (!invite) return { error: "That invite is gone." };
  const { error } = await ctx.admin.from("group_invites").delete().eq("id", inviteId);
  if (error) return { error: "Couldn't dismiss that invite." };
  return { error: null };
}
