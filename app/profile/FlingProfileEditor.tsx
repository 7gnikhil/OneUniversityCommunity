"use client";

import { useActionState } from "react";
import {
  saveFlingProfileAction,
  type FlingProfileFormState,
} from "./actions";
import type { FlingProfile } from "@/lib/fling";

const INITIAL_STATE: FlingProfileFormState = { error: null, saved: false };

// Settings → Fling data: the editor for the SEPARATE Fling profile
// (migration 0012). What a student types here is exactly what opens
// when someone taps their card in Fling — it is not the personal
// profile above, and none of the personal profile's fields are
// repeated here. All three fields are optional and free text.
export default function FlingProfileEditor({
  initial,
  accentHex,
}: {
  initial: FlingProfile;
  accentHex: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveFlingProfileAction,
    INITIAL_STATE,
  );

  const inputClass =
    "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";
  const labelClass = "flex flex-col gap-1 text-left";
  const labelTextClass = "text-xs text-neutral-400";

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <p className="text-xs leading-relaxed text-neutral-500">
        This is your Fling profile — it&apos;s what people see when they
        open your card in Fling. It lives separately from your profile
        above: fill in only what you want the deck to know.
      </p>
      <label className={labelClass}>
        <span className={labelTextClass}>Fling bio</span>
        <textarea
          name="flingBio"
          defaultValue={initial.bio ?? ""}
          placeholder="One line for the deck — optional"
          maxLength={300}
          rows={2}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Likes</span>
        <textarea
          name="flingLikes"
          defaultValue={initial.likes ?? ""}
          placeholder="Things you're into — music, food, games, anything"
          maxLength={500}
          rows={3}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Dislikes</span>
        <textarea
          name="flingDislikes"
          defaultValue={initial.dislikes ?? ""}
          placeholder="Things you're not into — just as useful to know"
          maxLength={500}
          rows={3}
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60"
        style={{ backgroundColor: accentHex }}
      >
        {pending ? "Saving…" : "Save Fling data"}
      </button>
      {state.error ? (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      ) : state.saved ? (
        <p className="text-sm text-emerald-400">Saved ✓</p>
      ) : null}
    </form>
  );
}
