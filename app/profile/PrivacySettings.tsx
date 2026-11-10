"use client";

import { useState, useTransition } from "react";
import { updatePrivacyAction } from "./actions";

// Chat privacy — the two WhatsApp-style switches from migration 0007:
//   Show my online status — off hides my online dot, my last seen AND
//     my typing state everywhere (DMs, Friends list, server channels).
//   Read receipts — off means people who message me never see the
//     yellow "viewed" ticks on their messages; their messages still
//     get marked read for MY unread counts, exactly like WhatsApp.
// Each flip saves immediately through updatePrivacyAction; a failed
// save rolls the switch back and says so.
export default function PrivacySettings({
  initialShowOnline,
  initialReadReceipts,
  accentHex,
}: {
  initialShowOnline: boolean;
  initialReadReceipts: boolean;
  accentHex: string;
}) {
  const [showOnline, setShowOnline] = useState<boolean>(initialShowOnline);
  const [readReceipts, setReadReceipts] = useState<boolean>(initialReadReceipts);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(next: { showOnline: boolean; readReceipts: boolean }): void {
    const previous = { showOnline, readReceipts };
    setShowOnline(next.showOnline);
    setReadReceipts(next.readReceipts);
    setError(null);
    startTransition(async () => {
      const result = await updatePrivacyAction(next);
      if (result.error) {
        setShowOnline(previous.showOnline);
        setReadReceipts(previous.readReceipts);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full flex-col gap-1 border-t border-neutral-900 pt-5">
      <h2 className="mb-1 text-sm font-medium">Privacy</h2>
      <ToggleRow
        label="Show my online status"
        hint="Off hides your online dot, last seen and typing — everywhere."
        value={showOnline}
        accentHex={accentHex}
        onChange={(value) => save({ showOnline: value, readReceipts })}
      />
      <ToggleRow
        label="Read receipts"
        hint="Off means senders never see the yellow viewed ticks on their messages to you."
        value={readReceipts}
        accentHex={accentHex}
        onChange={(value) => save({ showOnline, readReceipts: value })}
      />
      {error ? (
        <p className="px-3 pt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  accentHex,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  accentHex: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-neutral-200">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ backgroundColor: value ? accentHex : "#404040" }}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
