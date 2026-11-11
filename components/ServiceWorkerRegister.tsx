"use client";

import { useEffect } from "react";

// Registers the push service worker (public/sw.js) for signed-in
// students. Mounted from the root layout only when a session exists,
// next to PresenceHeartbeat. The worker handles push delivery and
// notification taps ONLY — it caches nothing, so it can never serve
// a stale app. Registration failures are silent by design.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent on purpose — notifications are decoration.
    });
  }, []);

  // Capture the Android/Chrome install prompt app-wide: it can fire
  // before the student ever opens Settings, where the Install button
  // lives (components/NotificationSettings.tsx reads the stash and
  // listens for the event).
  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      (window as unknown as { __oneucoInstallPrompt?: Event }).__oneucoInstallPrompt =
        event;
      window.dispatchEvent(new Event("oneuco-install-ready"));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  return null;
}
