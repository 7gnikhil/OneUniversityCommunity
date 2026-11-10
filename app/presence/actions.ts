"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, type AccountRow } from "@/lib/auth/account";
import { getSessionUser } from "@/lib/auth/session";
import { heartbeat, setTyping } from "@/lib/presence";

// Presence actions: the 30s client heartbeat and the typing setters the
// DM + server composers call while a student types.
//
// These run on the poll cadence, so the session is resolved the cheap
// way (local JWT claims via getSessionUser, getUser fallback — the same
// pattern as the chat poll actions). The actor ALWAYS comes from the
// session; no action here accepts an account id from the client.
// Everything fails silently: presence is best-effort decoration and a
// failed heartbeat must never surface an error in the UI.

interface PresenceCtx {
  account: AccountRow;
  admin: ReturnType<typeof createAdminClient>;
}

async function requirePresenceCtx(): Promise<PresenceCtx | null> {
  const supabase = await createClient();
  const sessionUser = await getSessionUser(supabase);
  if (!sessionUser) return null;
  const account = await getAccountByAuthUserId(supabase, sessionUser.id);
  if (!account) return null;
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  return { account, admin };
}

// One beat from PresenceHeartbeat (mount + every 30s while signed in).
export async function heartbeatAction(): Promise<void> {
  const ctx = await requirePresenceCtx();
  if (!ctx) return;
  await heartbeat(ctx.admin, ctx.account.id);
}

export type TypingKind = "dm" | "server";

// Mark me as typing in a DM (ref = match id) or a server channel
// (ref = channel id) for the next few seconds. The target is VERIFIED
// before anything is written: I must be a party to the match, or a
// member of the server the channel belongs to — a crafted call can't
// plant a typing row somewhere I don't belong.
export async function setTypingAction(
  kind: TypingKind,
  ref: string,
): Promise<void> {
  if (kind !== "dm" && kind !== "server") return;
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 64) return;
  const ctx = await requirePresenceCtx();
  if (!ctx) return;

  if (kind === "dm") {
    const { data } = await ctx.admin
      .from("matches")
      .select("account_a, account_b")
      .eq("id", ref)
      .maybeSingle();
    const match = (data ?? null) as {
      account_a: string;
      account_b: string;
    } | null;
    if (
      !match ||
      (match.account_a !== ctx.account.id && match.account_b !== ctx.account.id)
    ) {
      return;
    }
  } else {
    const { data } = await ctx.admin
      .from("channels")
      .select("server_id")
      .eq("id", ref)
      .maybeSingle();
    const channel = (data ?? null) as { server_id: string } | null;
    if (!channel) return;
    const { data: membership } = await ctx.admin
      .from("server_members")
      .select("account_id")
      .eq("server_id", channel.server_id)
      .eq("account_id", ctx.account.id)
      .maybeSingle();
    if (!membership) return;
  }

  await setTyping(ctx.admin, ctx.account.id, kind, ref);
}

// Clear my typing state (composer emptied, message sent, view closed).
export async function clearTypingAction(): Promise<void> {
  const ctx = await requirePresenceCtx();
  if (!ctx) return;
  await setTyping(ctx.admin, ctx.account.id, null, null);
}
