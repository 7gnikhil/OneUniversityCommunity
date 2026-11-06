"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface SignupState {
  error: string | null;
  // 'exists' lets the form render a "log in instead" link beside the
  // message. It reveals nothing about the existing account beyond the
  // fact the email is registered — which the student just typed in.
  code: "exists" | null;
}

const NOT_CONFIGURED =
  "Sign-up isn't fully configured yet — please try again later.";
const EXISTS_ERROR = "An account with this email already exists.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email + password sign-up. Any personal email works — a college email is
// never required. Creates the Supabase Auth user with the service-role
// admin client, signs the new user in on the session client (so the
// session cookies land), then hands over to /verify, where the completion
// steps (username claim + OneUco ID, then self-declared study details)
// take over. The accounts row is deliberately NOT created here —
// completion owns it, exactly like a first-time Google sign-in.
export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address.", code: null };
  }
  if (password.length < 8) {
    return { error: "Your password needs at least 8 characters.", code: null };
  }
  if (password !== confirmPassword) {
    return {
      error: "Those passwords don't match — type the same password twice.",
      code: null,
    };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: NOT_CONFIGURED, code: null };
  }

  // Friendly path first: a completed app account with this email means
  // the student should simply log in.
  const { data: existing } = await admin
    .from("accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return { error: EXISTS_ERROR, code: "exists" };
  }

  // email_confirm: true is deliberate. A brand-new account has NO access
  // to the app until it finishes the joining steps on /verify (username
  // claim + self-declared study details), so confirming inbox ownership
  // first would add a round-trip while granting nothing. Password reset
  // still proves inbox ownership at the moment it matters.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    // Covers an auth user that already exists without an accounts row
    // (e.g. the same email was used with Google first).
    if (createError.message.toLowerCase().includes("already")) {
      return { error: EXISTS_ERROR, code: "exists" };
    }
    return {
      error: "Couldn't create your account — please try again.",
      code: null,
    };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return {
      error:
        "Your account was created, but automatic sign-in failed — please log in with your new password.",
      code: null,
    };
  }

  redirect("/verify");
}
