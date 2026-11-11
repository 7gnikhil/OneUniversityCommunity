"use client";

import { useCallback, useEffect, useState } from "react";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/push/actions";

// Notifications & app install (re-engagement batch, 2026-11-11).
// Lives in its own Settings section. Two jobs:
//  1. Push — reflect this device's real state (unsupported / iPhone
//     needs install first / blocked / on / off) and subscribe or
//     unsubscribe through app/push/actions.ts. The subscription is
//     per-device: each browser keeps its own.
//  2. Install — fire the captured beforeinstallprompt when the
//     browser offered one (stashed on window by
//     ServiceWorkerRegister), otherwise show the manual steps for
//     the platform. On iPhone, installing is ALSO what unlocks
//     push, so the copy says so.

type PushState =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "on"
  | "off";

type InstallState = "checking" | "installed" | "prompt" | "manual";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export default function NotificationSettings({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [pushState, setPushState] = useState<PushState>("checking");
  const [installState, setInstallState] = useState<InstallState>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refreshPushState = useCallback(async (): Promise<void> => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      // iPhone Safari in a tab has no PushManager — that's the
      // install-first case, not plain unsupported.
      setPushState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushState(subscription ? "on" : "off");
    } catch {
      setPushState("off");
    }
  }, []);

  useEffect(() => {
    void refreshPushState();
    setInstallState(
      isStandalone()
        ? "installed"
        : (window as unknown as { __oneucoInstallPrompt?: Event })
              .__oneucoInstallPrompt
          ? "prompt"
          : "manual",
    );
    const onReady = (): void => setInstallState("prompt");
    window.addEventListener("oneuco-install-ready", onReady);
    return () => window.removeEventListener("oneuco-install-ready", onReady);
  }, [refreshPushState]);

  const enablePush = async (): Promise<void> => {
    if (!vapidPublicKey || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            vapidPublicKey,
          ) as BufferSource,
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setNote("This browser didn't hand over a complete subscription — try again.");
        return;
      }
      const result = await subscribePushAction({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      if (result.ok) {
        setPushState("on");
      } else {
        setNote("Couldn't save that on the server — please try again.");
      }
    } catch {
      setNote("Something blocked the sign-up — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePushAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushState("off");
    } catch {
      setNote("Couldn't switch that off — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    const promptEvent = (
      window as unknown as {
        __oneucoInstallPrompt?: BeforeInstallPromptEvent;
      }
    ).__oneucoInstallPrompt;
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstallState("installed");
    (window as unknown as { __oneucoInstallPrompt?: Event }).__oneucoInstallPrompt =
      undefined;
  };

  const buttonClass =
    "rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50";
  const ghostButtonClass =
    "rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Push ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Notifications</h3>
        <p className="text-sm leading-relaxed text-neutral-400">
          Get pinged for new matches, messages and follow requests — even
          when OneUco is closed. Only the important stuff, never noise.
        </p>
        {pushState === "checking" ? (
          <p className="text-sm text-neutral-500">Checking this device…</p>
        ) : pushState === "on" ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-emerald-400">On for this device</p>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void disablePush()}>
              Turn off
            </button>
          </div>
        ) : pushState === "off" ? (
          <div>
            <button type="button" className={buttonClass} disabled={busy || !vapidPublicKey} onClick={() => void enablePush()}>
              {busy ? "Turning on…" : "Turn on notifications"}
            </button>
            {!vapidPublicKey ? (
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                Notifications are being set up on the server — check back soon.
              </p>
            ) : null}
          </div>
        ) : pushState === "denied" ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            Notifications are blocked for OneUco in your browser settings.
            Allow them there, then come back and turn this on.
          </p>
        ) : pushState === "needs-install" ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            On iPhone, notifications switch on after OneUco is on your Home
            Screen — install it below first (Share → Add to Home Screen),
            open it from there, then turn notifications on.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-neutral-400">
            This browser doesn&apos;t support push notifications. Try Chrome
            on Android, or install OneUco below.
          </p>
        )}
        {note ? <p className="text-xs leading-relaxed text-amber-400">{note}</p> : null}
      </div>

      {/* ── Install ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-neutral-800 pt-5">
        <h3 className="text-sm font-medium">Install the app</h3>
        <p className="text-sm leading-relaxed text-neutral-400">
          OneUco on your Home Screen: full-screen, one tap away, and it
          unlocks notifications on iPhone.
        </p>
        {installState === "installed" ? (
          <p className="text-sm text-emerald-400">Installed — you&apos;re opening OneUco as an app</p>
        ) : installState === "prompt" ? (
          <div>
            <button type="button" className={buttonClass} onClick={() => void install()}>
              Install OneUco
            </button>
          </div>
        ) : installState === "manual" ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            {isIos()
              ? "Tap Share in Safari, then “Add to Home Screen”."
              : "Open your browser menu (⋮) and tap “Install app” or “Add to Home screen”."}
          </p>
        ) : (
          <p className="text-sm text-neutral-500">Checking…</p>
        )}
      </div>
    </div>
  );
}
