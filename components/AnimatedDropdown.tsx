"use client";

import { useId, useState, type ReactNode } from "react";

// Shared animated dropdown shell. Two scales of use:
//  • The Profile settings pickers (Interface, Dial style) — a header
//    row (title, the current selection's name in a pill, a chevron)
//    that expands on tap to reveal the option list, and collapses on
//    a second tap, on Escape, or the moment an option inside is
//    chosen (the option's own form still submits exactly as before;
//    this wrapper only animates the reveal).
//  • The five Settings SECTIONS on the profile page (Profile / Fling
//    data / Display / Queries / About & FAQs) — same shell, with the
//    pill carrying a one-line summary of the section instead of a
//    selection. Sections pass defaultOpen / collapseOnSubmit={false}:
//    a section must not fold away when one of its own forms saves.
//
// Motion: the CSS grid-template-rows 0fr → 1fr technique — the body
// wrapper transitions grid rows + opacity over 300ms ease-out, the
// inner overflow-hidden div clips it, and the chevron rotates over
// the same 300ms. The body stays mounted while closed (aria-hidden +
// pointer-events-none), which is what makes the CLOSE animation
// possible; it costs nothing interactive. Closed by default unless
// defaultOpen is set.

export default function AnimatedDropdown({
  title,
  currentLabel,
  defaultOpen = false,
  collapseOnSubmit = true,
  children,
}: {
  /** Title shown in the header ("Interface", "Profile", …). */
  title: string;
  /**
   * Text shown in the header pill — a picker's current selection, or
   * a section's one-line summary.
   */
  currentLabel: string;
  /** Start expanded (Settings' Profile section). Pickers omit it. */
  defaultOpen?: boolean;
  /**
   * Collapse when a submit button inside is clicked (picker option
   * chosen). Sections pass false so their forms save in place.
   */
  collapseOnSubmit?: boolean;
  /** The intro line + option list / section body (server-rendered). */
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const regionId = useId();

  return (
    <section
      className="metal-frame mt-6 w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <h2 className="text-sm font-semibold text-white">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={`${title}: ${currentLabel}`}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span aria-hidden>{title}</span>
          <span aria-hidden className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[11px] font-medium text-neutral-300">
              {currentLabel}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 text-neutral-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h2>
      <div
        id={regionId}
        aria-hidden={!open}
        onClickCapture={(event) => {
          // Choosing an option collapses the dropdown; the option's
          // form submission proceeds untouched. Section-scale users
          // opt out (collapseOnSubmit={false}) — their forms are the
          // section's content, not a selection to fold away after.
          if (
            collapseOnSubmit &&
            (event.target as HTMLElement).closest(
              'button[type="submit"]',
            )
          ) {
            setOpen(false);
          }
        }}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0 pointer-events-none"
        }`}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
