"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import {
  getLatestVerification,
  listCollegeCodes,
  type AltProof,
} from "@/lib/profile";
import {
  generateOneucoId,
  normaliseHallTicket,
  normaliseUsername,
  parseHallTicket,
  structureLayerFor,
  validateUsername,
} from "@/lib/validation";

export interface FormState {
  error: string | null;
}

export interface UsernameCheck {
  available: boolean;
  error: string | null;
}

const NOT_CONFIGURED =
  "Account setup isn't fully configured yet — please try again later.";

// Live @handle availability for the completion form. Uses the service-role
// client because pre-completion there is no account row for RLS to match,
// and the accounts table is (correctly) not world-readable.
export async function checkUsernameAction(
  rawUsername: string,
): Promise<UsernameCheck> {
  const formatError = validateUsername(rawUsername);
  if (formatError) return { available: false, error: formatError };
  const username = normaliseUsername(rawUsername);
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("accounts")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    return data
      ? { available: false, error: "That username is taken." }
      : { available: true, error: null };
  } catch {
    return { available: false, error: NOT_CONFIGURED };
  }
}

// Account completion: claims the username, generates the unique OneUco ID
// and creates the accounts row (linked to the auth user) + an empty
// profiles row — atomically enough for sign-up: both writes use the
// service-role client, and a profiles failure is retried on the next visit
// (the completion step re-runs and finds the account, then backfills the
// profile). Admin Pass accounts skip this entirely.
export async function completeAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { error: "Your session has expired — please log in again." };
  }
  // Capture narrowed values into consts before any further awaits.
  const authUserId: string = user.id;
  const email: string = user.email.toLowerCase();
  if (passesAdminGate(email, null)) {
    return { error: null };
  }

  const usernameError = validateUsername(
    String(formData.get("username") ?? ""),
  );
  if (usernameError) return { error: usernameError };
  const username = normaliseUsername(String(formData.get("username") ?? ""));

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: NOT_CONFIGURED };
  }

  // Already completed (e.g. double submit): just make sure the profile row
  // exists, then let the page move on to verification.
  const existing = await getAccountByAuthUserId(admin, authUserId);
  if (existing) {
    await ensureProfileRow(admin, existing, user.user_metadata);
    redirect("/verify");
  }

  // Generate the OneUco ID with retry on the (rare) unique collision.
  let lastError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const oneucoId = generateOneucoId();
    const { data: inserted, error } = await admin
      .from("accounts")
      .insert({
        auth_user_id: authUserId,
        oneuco_id: oneucoId,
        username,
        email,
        role: "student",
        status: "pending_verification",
      })
      .select("id, auth_user_id, oneuco_id, username, email, phone, role, status")
      .single();

    if (!error && inserted) {
      const account = inserted as AccountRow;
      await ensureProfileRow(admin, account, user.user_metadata);
      redirect("/verify");
    }

    lastError = error;
    const message = error?.message ?? "";
    if (message.includes("accounts_username_key")) {
      return { error: "That username was just taken — please pick another." };
    }
    if (message.includes("accounts_email_key")) {
      return {
        error:
          "An account already exists for this email. If that's you, log in with it instead.",
      };
    }
    if (!message.includes("accounts_oneuco_id_key")) break;
    // oneuco_id collision — loop and try a fresh ID.
  }

  void lastError;
  return { error: "Couldn't finish setting up your account — please try again." };
}

// profiles.name is NOT NULL; new profiles start with the name from the
// auth provider (Google supplies one) or blank — the student edits it on
// /profile. Nothing here is mandatory.
async function ensureProfileRow(
  admin: ReturnType<typeof createAdminClient>,
  account: AccountRow,
  userMetadata: Record<string, unknown> | undefined,
): Promise<void> {
  const { data } = await admin
    .from("profiles")
    .select("account_id")
    .eq("account_id", account.id)
    .maybeSingle();
  if (data) return;
  const metaName =
    typeof userMetadata?.full_name === "string"
      ? userMetadata.full_name
      : typeof userMetadata?.name === "string"
        ? userMetadata.name
        : "";
  await admin.from("profiles").insert({
    account_id: account.id,
    name: metaName,
  });
}

// ── Verification submission ────────────────────────────────────────────────
// The images were uploaded by the browser client straight into the PRIVATE
// id-cards bucket (paths prefixed with the account id) before this action
// runs; the action validates the paths belong to the account, re-checks
// the hall-ticket structure server-side, and writes the verifications row.
// layer_ocr stays 'not_provided' — OCR is a later phase and is never faked.
// NO failure path here rejects or bans anyone: doubtful rows simply sit in
// 'pending' for manual review.
export async function submitVerificationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session has expired — please log in again." };
  }
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) {
    return { error: "Finish creating your account first (step 1 above)." };
  }
  if (passesAdminGate(user.email, account)) {
    return { error: null };
  }
  const accountId: string = account.id;
  const pathPrefix = `${accountId}/`;

  const name = String(formData.get("name") ?? "").trim();
  const hallTicket = normaliseHallTicket(
    String(formData.get("hallTicket") ?? ""),
  );
  const branch = String(formData.get("branch") ?? "").trim();
  const collegeName = String(formData.get("collegeName") ?? "").trim();
  const selectedCollegeCode = String(formData.get("collegeCode") ?? "").trim();
  const gradYearRaw = Number(formData.get("gradYear") ?? "");
  const frontPath = String(formData.get("frontPath") ?? "").trim();
  const backPath = String(formData.get("backPath") ?? "").trim();

  if (!name) return { error: "Enter your full name exactly as on the ID card." };
  const structure = parseHallTicket(hallTicket);
  if (!structure) {
    return {
      error:
        "That hall-ticket number doesn't look right — it's 10 characters, starting with your joining year (e.g. 22XY101Z99).",
    };
  }
  if (
    !Number.isInteger(gradYearRaw) ||
    gradYearRaw < 2020 ||
    gradYearRaw > 2035
  ) {
    return { error: "Enter your graduation year (e.g. 2027)." };
  }
  if (!frontPath) {
    return { error: "Upload the front of your ID card first." };
  }
  if (!frontPath.startsWith(pathPrefix)) {
    return { error: "That ID card upload didn't come through — please re-upload it." };
  }
  if (backPath && !backPath.startsWith(pathPrefix)) {
    return { error: "That back-of-card upload didn't come through — please re-upload it." };
  }

  // Alternative proofs arrive as JSON written by the form: [{kind, path}].
  let altProofs: AltProof[] = [];
  try {
    const parsed: unknown = JSON.parse(
      String(formData.get("altProofs") ?? "[]"),
    );
    if (Array.isArray(parsed)) {
      altProofs = parsed.filter((row): row is AltProof => {
        if (typeof row !== "object" || row === null) return false;
        const candidate = row as { kind?: unknown; path?: unknown };
        return (
          (candidate.kind === "hall_ticket" ||
            candidate.kind === "bonafide" ||
            candidate.kind === "fee_receipt") &&
          typeof candidate.path === "string" &&
          candidate.path.startsWith(pathPrefix)
        );
      });
    }
  } catch {
    altProofs = [];
  }

  const collegeCodes = await listCollegeCodes(supabase);
  const layerStructure = structureLayerFor(structure, collegeCodes);
  // college_code is an FK into college_codes — only set it when the code
  // (from the select, or derived from the ticket) exists in the list.
  const knownCode =
    collegeCodes.find((row) => row.code === selectedCollegeCode)?.code ??
    collegeCodes.find((row) => row.code === structure.collegeCode)?.code ??
    null;

  const rowPayload = {
    account_id: accountId,
    hall_ticket: hallTicket,
    id_card_front_url: frontPath,
    id_card_back_url: backPath || null,
    parsed_fields: {
      name,
      hall_ticket: hallTicket,
      college_name: collegeName,
      college_code: structure.collegeCode,
      branch,
      grad_year: gradYearRaw,
    },
    college_code: knownCode,
    claimed_grad_year: gradYearRaw,
    layer_ocr: "not_provided",
    layer_structure: layerStructure,
    layer_email_otp: "not_provided",
    alt_proofs: { proofs: altProofs },
    status: "pending" as const,
  };

  const latest = await getLatestVerification(supabase, accountId);
  if (latest?.status === "verified") {
    return { error: "You're already verified — no need to submit again." };
  }

  if (latest?.status === "pending") {
    // Edit / re-submit the pending attempt in place (RLS allows students
    // to update their own pending row).
    const { error } = await supabase
      .from("verifications")
      .update({ ...rowPayload, review_reason: null })
      .eq("id", latest.id);
    if (error) {
      return { error: "Couldn't save your changes — please try again." };
    }
  } else {
    // First submission, or a fresh attempt after a rejection.
    const { error } = await supabase.from("verifications").insert(rowPayload);
    if (error) {
      return { error: "Couldn't submit your verification — please try again." };
    }
  }

  redirect("/verify");
}
