"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type SignupState } from "./actions";
import PasswordInput from "@/components/PasswordInput";

// Email + password sign-up form. All validation that matters is repeated
// server-side in the action (min length, match, existing account); this
// component only renders state. On success the action redirects to
// /verify — there is no "check your inbox" step, by design (see actions.ts).

const INITIAL_STATE: SignupState = { error: null, code: null };

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="w-full">
      <fieldset disabled={pending} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Password</span>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Confirm password</span>
          <PasswordInput
            name="confirmPassword"
            autoComplete="new-password"
            className={INPUT_CLASS}
          />
        </label>
        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Creating your account…" : "Create account"}
        </button>
      </fieldset>

      {state.error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {state.error}{" "}
          {state.code === "exists" ? (
            <Link
              href="/login"
              className="font-medium text-red-300 underline underline-offset-2 transition hover:text-red-200"
            >
              Log in instead
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
