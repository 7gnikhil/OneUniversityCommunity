"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Step 1 of the only reset flow in OneUco: ask Supabase to email a
// password-reset link. The link lands on /auth/callback and continues to
// /reset-password. The response shown is deliberately neutral — it never
// reveals whether an account exists for the email entered.
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState<string>("");
  const [sent, setSent] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Neutral on purpose: success and "no such account" look identical.
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-relaxed text-neutral-300">
        <p className="font-medium text-white">Check your email.</p>
        <p className="mt-1">
          If an account exists for that email, a password-reset link is on
          its way. The link expires in about 5 minutes, so use it straight
          away — if it lapses, just request a fresh one here.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1 text-left">
        <span className="text-xs text-neutral-400">Account email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
