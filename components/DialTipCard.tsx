"use client";

import { useState } from "react";
import { markDialTipSeenAction } from "@/app/profile/theme-actions";

// The one-time dial tip (owner's ask): on a user's FIRST-EVER landing
// on the dial home, a small metal card tells them the dial can be
// restyled by holding it. "Got it" persists profiles.dial_tip_seen
// (migration 0010) and the card never renders again — the home page
// only mounts this component when the server read that flag as a
// clean false (see getProfileDialTipSeen's fail-closed contract: on
// any read error the card is not shown at all). The local dismissal
// below is instant and optimistic; the action is fire-and-forget.
export default function DialTipCard() {
  const [dismissed, setDismissed] = useState<boolean>(false);
  if (dismissed) return null;

  return (
    <div className="metal-frame mt-5 flex items-start gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
        style={{
          background:
            "radial-gradient(circle at 34% 28%, #fff6bf 0%, #f3d267 38%, #caa12f 72%, #7a5410 100%)",
          boxShadow: "0 0 0 1.5px var(--metal-ring, #8a6414)",
        }}
      >
        ◎
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-neutral-200">
          New here? Hold the dial to change its style — pirate helm, car
          wheels, gold and more live there.
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            void markDialTipSeenAction();
          }}
          className="mt-2.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-neutral-200"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
