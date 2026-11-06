"use client";

import { useActionState } from "react";
import { adminLoginAction, type AdminLoginState } from "./actions";
import PasswordInput from "@/components/PasswordInput";

// Admin mail + password form. No Google on this door (owner decision);
// access is restricted by the server-side Admin Pass check in the action.
const INITIAL_STATE: AdminLoginState = { error: null };

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";

export default function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(
    adminLoginAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="w-full">
      <fieldset disabled={pending} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Admin email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="Owner mail"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-left">
          <span className="text-xs text-neutral-400">Password</span>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            className={INPUT_CLASS}
          />
        </label>
        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Sign in as admin"}
        </button>
      </fieldset>

      {state.error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
