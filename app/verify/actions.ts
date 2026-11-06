"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { listCollegeCodes, type CollegeCodeRow } from "@/lib/profile";
import {
  collegeCodeCandidates,
  generateOneucoId,
  normaliseCollegeDisplayName,
  normaliseCollegeName,
  normaliseUsername,
  validateUsername,
} from "@/lib/validation";

export interface FormState {
  error: string | null;
}

export interface UsernameCheck {
  available: boolean;
  error: string | null;
}

export interface AddCollegeResult {
  college: CollegeCodeRow | null;
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
  // exists, then let the page move on to the self-declared study details.
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
      .select(
        "id, auth_user_id, oneuco_id, username, email, phone, role, status, college_name, college_code, branch, graduation_year",
      )
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

// ── Open college registry ─────────────────────────────────────────────────
// Add a college / university that is not listed yet. The new row starts as
// 'pending' and records its adder; it is returned immediately so the form
// can select it. If the same normalised name is already approved — or is
// already the caller's own pending entry — that row is returned instead of
// creating a duplicate. The service-role client is used because the base
// RLS policy reserves registry writes for admins/service role; this action
// supplies the missing student path while stamping added_by from the
// authenticated session, never from client input.
export async function addCollegeAction(
  rawName: string,
  rawCity?: string | null,
): Promise<AddCollegeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      college: null,
      error: "Your session has expired — please log in again.",
    };
  }
  const account = await getAccountByAuthUserId(supabase, user.id);
  if (!account) {
    return {
      college: null,
      error: "Finish creating your account first (step 1 above).",
    };
  }
  const accountId: string = account.id;

  const collegeName = normaliseCollegeDisplayName(rawName);
  if (collegeName.length < 2 || collegeName.length > 160) {
    return {
      college: null,
      error: "Enter your college or university name (2–160 characters).",
    };
  }
  const city = rawCity?.trim().replace(/\s+/g, " ") ?? "";
  if (city.length > 80) {
    return { college: null, error: "Keep the city under 80 characters." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { college: null, error: NOT_CONFIGURED };
  }

  const normalisedName = normaliseCollegeName(collegeName);

  // A short retry loop covers the tiny race where two students derive the
  // same new registry code at the same moment.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error: readError } = await admin
      .from("college_codes")
      .select("code, college_name, city, status, added_by")
      .order("college_name", { ascending: true });
    if (readError) {
      return {
        college: null,
        error: "Couldn't reach the college registry — please try again.",
      };
    }
    const rows = (data ?? []) as CollegeCodeRow[];
    const duplicate = rows.find(
      (row) =>
        normaliseCollegeName(row.college_name) === normalisedName &&
        (row.status === "approved" || row.added_by === accountId),
    );
    if (duplicate) return { college: duplicate, error: null };

    const candidates = collegeCodeCandidates(collegeName, rows);
    let collided = false;
    for (const code of candidates) {
      const { data: inserted, error } = await admin
        .from("college_codes")
        .insert({
          code,
          college_name: collegeName,
          city: city || null,
          status: "pending",
          added_by: accountId,
        })
        .select("code, college_name, city, status, added_by")
        .single();
      if (!error && inserted) {
        return { college: inserted as CollegeCodeRow, error: null };
      }
      const message = error?.message ?? "";
      if (
        message.includes("college_codes_pkey") ||
        message.toLowerCase().includes("duplicate key")
      ) {
        collided = true;
        continue;
      }
      return {
        college: null,
        error: "Couldn't add that college — please try again.",
      };
    }
    if (!collided) break;
  }

  return {
    college: null,
    error: "Couldn't add that college — please try again.",
  };
}

// ── Self-declared profile completion ──────────────────────────────────────
// The student declares where they study: college / university, branch and
// graduation year. There are NO documents and NO checks in this step. The
// values are written to the PRIVATE accounts row (never to public_profiles)
// and the account becomes verified immediately — the student is in.
export async function completeProfileAction(
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
  if (passesAdminGate(user.email, account) || account.status === "verified") {
    redirect("/");
  }
  if (account.status === "suspended") {
    return {
      error:
        "This account is suspended, so profile completion is unavailable.",
    };
  }
  const accountId: string = account.id;

  const selectedCollegeCode = String(formData.get("collegeCode") ?? "").trim();
  const typedCollegeName = normaliseCollegeDisplayName(
    String(formData.get("collegeName") ?? ""),
  );
  const branch = String(formData.get("branch") ?? "").trim().replace(/\s+/g, " ");
  const gradYearRaw = Number(formData.get("gradYear") ?? "");

  if (typedCollegeName.length < 2 || typedCollegeName.length > 160) {
    return { error: "Enter your college or university name." };
  }
  if (branch.length < 2 || branch.length > 80) {
    return { error: "Enter your branch (for example, CSE (AI & ML))." };
  }
  if (
    !Number.isInteger(gradYearRaw) ||
    gradYearRaw < 2020 ||
    gradYearRaw > 2035
  ) {
    return { error: "Enter your graduation year (for example, 2027)." };
  }

  // A registry code is stored only when it is one this student may select:
  // an approved college, or their own pending addition. A free-text college
  // simply stores its name with no code.
  const collegeCodes = await listCollegeCodes(supabase, accountId);
  const selectedCollege = selectedCollegeCode
    ? collegeCodes.find((row) => row.code === selectedCollegeCode) ?? null
    : null;
  const collegeName = selectedCollege
    ? selectedCollege.college_name
    : typedCollegeName;
  const collegeCode = selectedCollege ? selectedCollege.code : null;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: NOT_CONFIGURED };
  }

  const { error } = await admin
    .from("accounts")
    .update({
      college_name: collegeName,
      college_code: collegeCode,
      branch,
      graduation_year: gradYearRaw,
      status: "verified",
    })
    .eq("id", accountId);
  if (error) {
    return { error: "Couldn't save your profile — please try again." };
  }

  redirect("/");
}
