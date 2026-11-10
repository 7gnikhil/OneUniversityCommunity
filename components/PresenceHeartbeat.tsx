"use client";

import { useEffect } from "react";
import { heartbeatAction } from "@/app/presence/actions";

// Presence heartbeat: while a student is signed in, ping the presence
// action on mount and every 30 seconds so lib/presence can call them
// "online" (last seen within 3 minutes). Mounted from the root layout
// ONLY when a session exists. Renders nothing; every failure is silent
// by design — presence is decoration, never a reason to show an error.
const HEARTBEAT_MS = 30_000;

export default function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const beat = (): void => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void heartbeatAction().catch(() => {
        // Silent on purpose.
      });
    };

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    // A tab coming back to the foreground beats immediately instead of
    // waiting out the rest of the interval.
    const onVisible = (): void => {
      if (!document.hidden) beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
