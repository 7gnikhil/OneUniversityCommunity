"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";

// "Req to Developer" submissions. The form IS the developer contact — no
// email address is shown anywhere. Rows are the student's own
// (devreq_insert_own RLS), and admins move them through
// received → planned → done / declined from /admin/developer-requests;
// every status change delivers an Inbox notice back to the student.

export type DeveloperRequestCategory = "change" | "addon" | "bug" | "other";
export type DeveloperRequestStatus = "received" | "planned" | "done" | "declined";

export interface DeveloperRequestRow {
  id: string;
  account_id: string;
  category: DeveloperRequestCategory;
  title: string;
  body: string;
  status: DeveloperRequestStatus;
  created_at: string;
  updated_at: string;
}

const DEVREQ_COLUMNS =
  "id, account_id, category, title, body, status, created_at, updated_at";

export async function submitDeveloperRequestAction(
  category: string,
  title: string,
  body: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return { error: "Finish setting up your account first." };

  const validCategory: DeveloperRequestCategory =
    category === "change" || category === "addon" || category === "bug"
      ? category
      : "other";
  const cleanTitle = title.trim().slice(0, 120);
  const cleanBody = body.trim().slice(0, 2000);
  if (!cleanTitle) return { error: "Give your request a short title." };
  if (!cleanBody) return { error: "Tell the developer what you need." };

  const { error } = await supabase.from("developer_requests").insert({
    account_id: account.id,
    category: validCategory,
    title: cleanTitle,
    body: cleanBody,
  });
  if (error) return { error: "That didn't send — please try again." };
  return { error: null };
}

export async function listMyDeveloperRequestsAction(): Promise<DeveloperRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) return [];
  const { data } = await supabase
    .from("developer_requests")
    .select(DEVREQ_COLUMNS)
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as DeveloperRequestRow[];
}
