"use client";

import { useEffect } from "react";
import { getMyBadgeCountAction } from "@/app/activity/actions";

// App-icon badge (2026-11-20, owner's ask: "the count symbol on
// the icon"): keeps the installed PWA's icon badge equal to the
// in-app unread total (DMs + Tea + Inbox). Uses the Badging API —
// Chromium/Android/desktop support it; browsers without it simply
// skip (the in-app badges still work). Syncs on mount, every 30s,
// and whenever the app comes back to the foreground, so reading
// messages clears the number without a reload.
export default function AppBadgeSync() {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;
    let stopped = false;
    const sync = async (): Promise<void> => {
      try {
        const count = await getMyBadgeCountAction();
        if (stopped) return;
        if (count > 0) await nav.setAppBadge!(count);
        else if (typeof nav.clearAppBadge === "function") {
          await nav.clearAppBadge();
        }
      } catch {
        // Badge is a nicety; never surface errors for it.
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 30_000);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return null;
}
