"use client";

import { useActionState } from "react";
import {
  adminForgotPasswordAction,
  type AdminRecoveryState,
} from "./actions";

// Admin recovery form. On submit it ALWAYS lands on the same neutral
// confirmation (see actions.ts): the server emails a reset link only
// when the address can actually recover the admin account, and nothing
// on this page reveals whether that happened.
const INITIAL_STATE: AdminRecoveryState = { submitted: false };

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";

export default function AdminForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    adminForgotPasswordAction,
    INITIAL_STATE,
  );

  if (state.submitted) {
    return (
      <div className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-sm leading-relaxed text-neutral-300">
        <p className="font-medium text-white">Check your email.</p>
        <p className="mt-1">
          If that email can recover the admin account, a reset link is on
          its way.
        </p>
      </div>
    );
  }

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
        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Email me a reset link"}
        </button>
      </fieldset>
    </form>
  );
}
