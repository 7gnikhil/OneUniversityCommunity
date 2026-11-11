import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// ── Web Push sending (server-only) ─────────────────────────────────
// Re-engagement batch, 2026-11-11: matches, DMs and follow events
// push to a student's subscribed devices. Subscriptions live in
// push_subscriptions (migration 0013) and are written by
// app/push/actions.ts; this module only READS them (service role)
// and sends.
//
// Failure philosophy, same as presence: push is decoration. Every
// entry point fails soft — a missing VAPID config, a dead endpoint
// or a push-service error must NEVER break the swipe / message /
// follow action that triggered the notification. Dead subscriptions
// (404/410 from the push service) are pruned as they're found.

export interface PushPayload {
  title: string;
  body: string;
  /** App path the notification opens, e.g. /friends/<matchId>. */
  url: string;
  /** Same-tag notifications replace each other instead of stacking. */
  tag?: string;
}

let configured: boolean | null = null;

function configureWebPush(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return configured;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one payload to every device the account has subscribed. */
export async function notifyAccount(
  admin: SupabaseClient,
  accountId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    if (!configureWebPush()) return;
    const { data } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("account_id", accountId);
    const rows = (data ?? []) as SubscriptionRow[];
    if (rows.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            body,
            { TTL: 60 * 60 },
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // The browser dropped this subscription — prune it so we
            // stop paying sends to a dead endpoint.
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("id", row.id);
          }
        }
      }),
    );
  } catch {
    // Never throw into the calling action.
  }
}

/** Display name for notification copy (profile name, else @handle). */
export async function getNotifyDisplayName(
  admin: SupabaseClient,
  accountId: string,
): Promise<string> {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("name")
      .eq("account_id", accountId)
      .maybeSingle();
    const name = (profile as { name?: string } | null)?.name?.trim();
    if (name) return name;
    const { data: account } = await admin
      .from("accounts")
      .select("username")
      .eq("id", accountId)
      .maybeSingle();
    const username = (account as { username?: string } | null)?.username;
    if (username) return `@${username}`;
  } catch {
    // Fall through to the generic name.
  }
  return "Someone";
}

/**
 * True when the account was seen within the presence window (online =
 * last seen under 3 minutes, the app's own definition) — someone
 * already in the app doesn't need a push for what's on their screen.
 */
export async function isRecentlyActive(
  admin: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data } = await admin
      .from("presence")
      .select("account_id")
      .eq("account_id", accountId)
      .gte("last_seen_at", cutoff)
      .maybeSingle();
    return data !== null;
  } catch {
    return false;
  }
}
