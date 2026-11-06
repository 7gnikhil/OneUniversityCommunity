"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import PasswordInput from "@/components/PasswordInput";

// Password login form: a single identifier field (OneUco ID / username /
// email / phone) + password, posted to the server action.
//
// Attempt lockout (slice 1): after 5 failed attempts IN THIS FORM SESSION
// the form locks for 60 seconds with a countdown. This is a client-side
// speed bump + clear messaging only — it resets on reload and is NOT a
// security boundary; a server-side rate limit is a hardening TODO.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

const INITIAL_STATE: LoginState = { error: null };

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);
  const [attempts, setAttempts] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Count each failed submission (the action returns a fresh state object
  // every time, so this fires once per failed attempt).
  useEffect(() => {
    if (state.error) setAttempts((count) => count + 1);
  }, [state]);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS && lockedUntil === null) {
      setLockedUntil(Date.now() + LOCK_MS);
    }
  }, [attempts, lockedUntil]);

  useEffect(() => {
    if (lockedUntil === null) return;
    // Capture as a non-null const: TypeScript cannot narrow the state
    // variable itself inside the nested update() closure.
    const until: number = lockedUntil;
    function update(): void {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setSecondsLeft(0);
      } else {
        setSecondsLeft(remaining);
      }
    }
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const locked = lockedUntil !== null;
  const disabled = pending || locked;

  return (
    <form action={formAction} className="w-full">
      <fieldset disabled={disabled} className="flex w-full flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">
            OneUco ID, username, email or phone
          </span>
          <input
            name="identifier"
            type="text"
            autoComplete="username"
            required
            placeholder="e.g. UCXXXXXX or @handle"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Password</span>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Log in"}
        </button>
      </fieldset>

      {locked ? (
        <p className="mt-3 text-sm text-amber-400" role="alert">
          Too many failed attempts — this form is locked for {secondsLeft}s.
          If you&apos;ve forgotten your password, use “Forgot password” below.
        </p>
      ) : state.error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {state.error}
          {attempts > 0
            ? ` (Attempt ${attempts} of ${MAX_ATTEMPTS} before a short lock.)`
            : ""}
        </p>
      ) : null}
    </form>
  );
}
