"use client";

import { useState } from "react";

// Share profile (Instagram pattern, 2026-11-17): the system share
// sheet where available (WhatsApp etc.), clipboard copy as the
// fallback, with a brief "Link copied" confirmation.
export default function ShareProfileButton({
  username,
  path,
}: {
  username: string;
  /** Absolute path of the public profile, e.g. /profile/nikhil7g. */
  path: string;
}) {
  const [copied, setCopied] = useState<boolean>(false);

  async function share(): Promise<void> {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `@${username} on OneUco`,
          text: `Find me on OneUco — @${username}`,
          url,
        });
        return;
      }
      throw new Error("no native share");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        // Clipboard blocked too — nothing more the page can do.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
    >
      {copied ? "Link copied ✔" : "Share profile"}
    </button>
  );
}
