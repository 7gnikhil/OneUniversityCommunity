"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { deliverInboxItem } from "@/lib/inbox";
import { REQ_TO_ADMIN_FLAIR } from "@/lib/servers";

// Admin queue actions (Slice 4): flair CRUD, developer-request statuses,
// college registry review, report handling. Every action re-checks the
// Admin Pass server-side and then works through the service role — the
// admin pages are gated by middleware too, but actions never trust the
// page gate alone.

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

// ── Flairs ─────────────────────────────────────────────────────────────────
// CRUD over global (server_id null) and per-server flairs. The built-in
// global ReqToAdmin flair is protected: it can be recoloured but never
// renamed or deleted (the queue depends on its name).
export async function createFlairAction(
  serverId: string | null,
  name: string,
  color: string,
): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const cleanName = name.trim().slice(0, 40);
  if (!cleanName) return { error: "Give the flair a name." };
  const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : "#888888";
  const { error } = await ctx.admin.from("flairs").insert({
    server_id: serverId,
    name: cleanName,
    color: cleanColor,
    created_by: ctx.account.id,
  });
  if (error) {
    return {
      error: error.message.includes("unique")
        ? "A flair with that name already exists there."
        : "Couldn't create the flair.",
    };
  }
  revalidatePath("/admin/flairs");
  return { error: null };
}

export async function updateFlairColorAction(
  flairId: string,
  color: string,
): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : "#888888";
  const { error } = await ctx.admin
    .from("flairs")
    .update({ color: cleanColor })
    .eq("id", flairId);
  if (error) return { error: "Couldn't update the flair." };
  revalidatePath("/admin/flairs");
  return { error: null };
}

export async function deleteFlairAction(flairId: string): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const { data } = await ctx.admin
    .from("flairs")
    .select("id, server_id, name")
    .eq("id", flairId)
    .maybeSingle();
  const flair = (data ?? null) as {
    id: string;
    server_id: string | null;
    name: string;
  } | null;
  if (!flair) return { error: "That flair is gone." };
  if (flair.server_id === null && flair.name === REQ_TO_ADMIN_FLAIR) {
    return { error: "ReqToAdmin is built in — it can be recoloured, not deleted." };
  }
  // Messages keep existing; their flair_id is FK ON DELETE default (no
  // action in schema.sql = restrict) — so clear assignments first.
  await ctx.admin.from("server_messages").update({ flair_id: null }).eq("flair_id", flairId);
  const { error } = await ctx.admin.from("flairs").delete().eq("id", flairId);
  if (error) return { error: "Couldn't delete the flair." };
  revalidatePath("/admin/flairs");
  return { error: null };
}

// ── Developer requests ─────────────────────────────────────────────────────
const DEV_STATUSES = ["received", "planned", "done", "declined"] as const;
export type DevStatus = (typeof DEV_STATUSES)[number];

const DEV_STATUS_LABELS: Record<DevStatus, string> = {
  received: "Received",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

export async function setDeveloperRequestStatusAction(
  requestId: string,
  status: string,
): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const cleanStatus: DevStatus = (DEV_STATUSES as readonly string[]).includes(status)
    ? (status as DevStatus)
    : "received";

  const { data } = await ctx.admin
    .from("developer_requests")
    .select("id, account_id, title, status")
    .eq("id", requestId)
    .maybeSingle();
  const request = (data ?? null) as {
    id: string;
    account_id: string;
    title: string;
    status: string;
  } | null;
  if (!request) return { error: "That request is gone." };
  if (request.status === cleanStatus) return { error: null };

  const { error } = await ctx.admin
    .from("developer_requests")
    .update({ status: cleanStatus })
    .eq("id", requestId);
  if (error) return { error: "Couldn't update the status." };

  // The status change surfaces in the student's Inbox (and their Help
  // page list re-reads the row itself).
  await deliverInboxItem(
    ctx.admin,
    request.account_id,
    "developer_update",
    `Developer request: ${DEV_STATUS_LABELS[cleanStatus]}`,
    `"${request.title}" is now marked ${DEV_STATUS_LABELS[cleanStatus]}.`,
    requestId,
  );
  revalidatePath("/admin/developer-requests");
  return { error: null };
}

// ── College registry review ────────────────────────────────────────────────
// college_codes.status has only 'approved' | 'pending' (migration-0002),
// so Reject = delete the row. accounts.college_code references it with
// ON DELETE SET NULL, so students who picked it keep their declared
// college_name text and just lose the registry link.
export async function approveCollegeAction(code: string): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const { error } = await ctx.admin
    .from("college_codes")
    .update({ status: "approved" })
    .eq("code", code);
  if (error) return { error: "Couldn't approve that college." };
  revalidatePath("/admin/colleges");
  return { error: null };
}

export async function rejectCollegeAction(code: string): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const { error } = await ctx.admin.from("college_codes").delete().eq("code", code);
  if (error) return { error: "Couldn't remove that college." };
  revalidatePath("/admin/colleges");
  return { error: null };
}

// ── Reports ────────────────────────────────────────────────────────────────
export async function setReportStatusAction(
  reportId: string,
  status: string,
): Promise<AdminActionResult> {
  const ctx = await requireAdmin();
  if (!ctx) return { error: "Admins only." };
  const cleanStatus = status === "actioned" ? "actioned" : "dismissed";
  const { error } = await ctx.admin
    .from("reports")
    .update({ status: cleanStatus })
    .eq("id", reportId);
  if (error) return { error: "Couldn't update that report." };
  revalidatePath("/admin/reports");
  return { error: null };
}
