"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Profile QR (queued feature, approved 2026-11-17): a scannable
// code for my own profile URL, WhatsApp-style — show it in person
// or screenshot it into a story and the scan lands straight on
// /profile/<username>. Generated in the browser on open; nothing
// is uploaded anywhere.
export default function ProfileQr({ username }: { username: string }) {
  const [open, setOpen] = useState<boolean>(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || dataUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = `${window.location.origin}/profile/${username}`;
        const generated = await QRCode.toDataURL(url, {
          width: 480,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(generated);
      } catch {
        // QR is a garnish — the share button still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dataUrl, username]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
      >
        QR code
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label="My profile QR code"
        >
          <div
            className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl bg-neutral-950 p-6 text-center"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-white">@{username}</p>
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt={`QR code for @${username}'s profile`}
                className="h-56 w-56 rounded-2xl bg-white p-2"
              />
            ) : (
              <p className="py-16 text-sm text-neutral-500">Making your code…</p>
            )}
            <p className="text-xs leading-relaxed text-neutral-500">
              Anyone who scans this lands on your profile. Screenshot
              it for your story or show it in person.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
