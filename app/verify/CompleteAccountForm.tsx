"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  checkUsernameAction,
  completeAccountAction,
  type FormState,
} from "./actions";
import { normaliseUsername, validateUsername } from "@/lib/validation";

const INITIAL_STATE: FormState = { error: null };

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "problem"; message: string };

// Step 1 on /verify for a signed-in user who has no accounts row yet:
// claim a @username (live availability check, debounced) and submit — the
// server action generates the unique OneUco ID and creates the account +
// empty profile rows.
export default function CompleteAccountForm() {
  const [state, formAction, pending] = useActionState(
    completeAccountAction,
    INITIAL_STATE,
  );
  const [username, setUsername] = useState<string>("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const candidate = normaliseUsername(username);
    if (!candidate) {
      setCheck({ kind: "idle" });
      return;
    }
    const formatError = validateUsername(candidate);
    if (formatError) {
      setCheck({ kind: "problem", message: formatError });
      return;
    }
    setCheck({ kind: "checking" });
    debounceRef.current = window.setTimeout(() => {
      void checkUsernameAction(candidate).then((result) => {
        if (result.available) {
          setCheck({ kind: "ok" });
        } else {
          setCheck({
            kind: "problem",
            message: result.error ?? "That username is taken.",
          });
        }
      });
    }, 450);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [username]);

  return (
    <form action={formAction} className="w-full text-left">
      <fieldset disabled={pending} className="flex w-full flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">
            Choose your @username
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
              @
            </span>
            <input
              name="username"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="yourhandle"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 pl-8 pr-4 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
            />
          </div>
          <span className="text-[11px] leading-relaxed text-neutral-500">
            3–20 characters: lowercase letters, digits and underscores,
            starting with a letter. This is how other students find you.
          </span>
        </label>

        {check.kind === "checking" ? (
          <p className="text-xs text-neutral-500">Checking availability…</p>
        ) : check.kind === "ok" ? (
          <p className="text-xs text-emerald-400">
            @{normaliseUsername(username)} is available.
          </p>
        ) : check.kind === "problem" ? (
          <p className="text-xs text-amber-400">{check.message}</p>
        ) : null}

        <p className="text-xs leading-relaxed text-neutral-500">
          Your unique OneUco ID (like UC + 6 characters) is generated for you
          when you continue — it&apos;s one of the ways you can log in.
        </p>

        <button
          type="submit"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Creating your account…" : "Create my account"}
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
