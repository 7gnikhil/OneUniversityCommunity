"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getMyActivityAction,
  type ActivityItem,
} from "@/app/activity/actions";

// In-app notifications (2026-11-20, owner's ask: "if someone
// messages us while using the app we should get notified in app
// only"): push notifications are deliberately suppressed while a
// user is active in the app (presence window in lib/push), which
// left a gap — nothing surfaced at all. This stack polls the
// activity action every 25s and toasts anything new: DMs, Tea
// messages, matches, follows, joins. Items for the screen the
// user is already looking at never toast (they can see it), and
// only activity after the app opened is shown — no history replay.
export default function InAppToasts() {
  const [toasts, setToasts] = useState<ActivityItem[]>([]);
  const lastSeenRef = useRef<string>(new Date().toISOString());
  const seenRef = useRef<Set<string>>(new Set());
  const pathname = usePathname() ?? "/";
  const pathnameRef = useRef<string>(pathname);
  pathnameRef.current = pathname;
  const router = useRouter();

  const dismiss = useCallback((id: string): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    let stopped = false;
    const poll = async (): Promise<void> => {
      try {
        const items = await getMyActivityAction(lastSeenRef.current);
        if (stopped || items.length === 0) return;
        lastSeenRef.current = items[0].at;
        const fresh = items.filter(
          (item) =>
            !seenRef.current.has(item.id) && item.url !== pathnameRef.current,
        );
        for (const item of items) seenRef.current.add(item.id);
        if (fresh.length === 0) return;
        const shown = fresh.slice(0, 3);
        setToasts((current) => [...shown, ...current].slice(0, 3));
        for (const toast of shown) {
          setTimeout(() => dismiss(toast.id), 6000);
        }
      } catch {
        // Toasts are a nicety; a failed poll just tries again later.
      }
    };
    const first = setTimeout(() => void poll(), 8000);
    const timer = setInterval(() => void poll(), 25_000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            dismiss(toast.id);
            router.push(toast.url);
          }}
          className="pointer-events-auto w-full max-w-sm cursor-pointer rounded-2xl border border-white/10 bg-neutral-900/95 px-4 py-3 shadow-2xl backdrop-blur transition hover:bg-neutral-800/95"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm font-semibold text-white">
              {toast.title}
            </p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={(event) => {
                event.stopPropagation();
                dismiss(toast.id);
              }}
              className="shrink-0 text-sm text-neutral-500 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          {toast.body ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-neutral-400">
              {toast.body}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
