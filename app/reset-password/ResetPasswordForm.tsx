"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/PasswordInput";

// Step 2 of the reset flow. The email link (via /auth/callback) establishes
// a short-lived recovery session; this form sets the new password on that
// session's auth user. Without a session — link not clicked, or expired
// (~5 minutes) — there is nothing to update, and the user is told to
// request a fresh link instead.
export default function ResetPasswordForm() {
  const [ready, setReady] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function check(): Promise<void> {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active) setReady(Boolean(session));
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        "That reset session has expired. Request a fresh link and use it within a few minutes.",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-relaxed text-neutral-300">
        <p className="font-medium text-white">Password updated.</p>
        <p className="mt-1">You can now log in with your new password.</p>
        <Link
          href="/login"
          className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-relaxed text-neutral-300">
        <p className="font-medium text-white">Open your reset link first.</p>
        <p className="mt-1">
          This page only works right after clicking the password-reset link
          in your email — and those links expire in about 5 minutes. If yours
          has lapsed, request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-3 inline-block text-sm text-neutral-200 underline underline-offset-4"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1 text-left">
        <span className="text-xs text-neutral-400">New password</span>
        <PasswordInput
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-neutral-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-xs text-neutral-400">Confirm new password</span>
        <PasswordInput
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-neutral-500 focus:outline-none"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
      >
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
