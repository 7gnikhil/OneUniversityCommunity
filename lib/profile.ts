// Row shapes + lookups for profiles, verifications and college codes.
// Follows the lib/auth/account.ts pattern: the caller passes a Supabase
// client (session client for RLS-scoped reads, service-role where noted),
// so this file stays free of next/headers and can be imported anywhere
// server-side. Hand-typed until generated database types land.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Intention, VerificationStatus } from "@/lib/types";

// ── profiles (PUBLIC fields only — see schema design rules) ───────────────
export interface ProfileRow {
  account_id: string;
  name: string;
  bio: string | null;
  branch: string | null;
  photo_url: string | null;
  photo_urls: string[];
  interests: string[];
  portfolio: Record<string, string>;
  intention: Intention | null;
  preferences: Record<string, Record<string, unknown>>;
  accent_color: string;
}

const PROFILE_COLUMNS =
  "account_id, name, bio, branch, photo_url, photo_urls, interests, portfolio, intention, preferences, accent_color";

export async function getProfileByAccountId(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("account_id", accountId)
    .maybeSingle();
  return (data ?? null) as ProfileRow | null;
}

// ── verifications (PRIVATE — owner + admins only under RLS) ───────────────
export interface AltProof {
  kind: "hall_ticket" | "bonafide" | "fee_receipt";
  path: string;
}

export interface ParsedFields {
  name?: string;
  hall_ticket?: string;
  college_name?: string;
  college_code?: string;
  branch?: string;
  grad_year?: number;
}

export interface VerificationRow {
  id: string;
  account_id: string;
  hall_ticket: string | null;
  id_card_front_url: string | null;
  id_card_back_url: string | null;
  parsed_fields: ParsedFields;
  college_code: string | null;
  claimed_grad_year: number | null;
  layer_ocr: string;
  layer_structure: string;
  layer_email_otp: string;
  alt_proofs: { proofs?: AltProof[] };
  status: VerificationStatus;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

const VERIFICATION_COLUMNS =
  "id, account_id, hall_ticket, id_card_front_url, id_card_back_url, parsed_fields, college_code, claimed_grad_year, layer_ocr, layer_structure, layer_email_otp, alt_proofs, status, review_reason, created_at, updated_at";

// The student's most recent verification attempt (they may re-submit after
// a rejection — each attempt is its own row).
export async function getLatestVerification(
  supabase: SupabaseClient,
  accountId: string,
): Promise<VerificationRow | null> {
  const { data } = await supabase
    .from("verifications")
    .select(VERIFICATION_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as VerificationRow | null;
}

// ── college registry (open; approved rows + the caller's pending rows) ────
export type CollegeStatus = "approved" | "pending";

export interface CollegeCodeRow {
  code: string;
  college_name: string;
  city: string | null;
  status: CollegeStatus;
  added_by: string | null;
}

export async function listCollegeCodes(
  supabase: SupabaseClient,
  accountId: string,
): Promise<CollegeCodeRow[]> {
  const { data } = await supabase
    .from("college_codes")
    .select("code, college_name, city, status, added_by")
    .or(`status.eq.approved,added_by.eq.${accountId}`)
    .order("college_name", { ascending: true });
  return (data ?? []) as CollegeCodeRow[];
}
