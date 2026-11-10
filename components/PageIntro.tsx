import { PAGE_INTROS, type PageIntroSection } from "@/lib/page-intros";

// The permanent one-line brief at the top of a section (see
// lib/page-intros). Rendered on every page open — it is part of the
// page furniture, not a tip: nothing to dismiss, nothing remembered.
//
// Styling: small muted text led by the SECTION's colour (globals.css
// --section-accent, bound by the page's data-section stamp to the
// same hue as the section's dial stop): a dot with a soft halo, over
// a short gradient bar in the same hue. Sections without a hue
// (inbox, search) fall back to the applied interface's --accent
// token, then to a neutral grey in the seasonal look. The text tone
// is text-neutral-500, which the interfaces' CSS remaps to their
// muted tone — so the line sits correctly in dark themes, light
// themes and the classic look alike.
export default function PageIntro({ section }: { section: PageIntroSection }) {
  return (
    <p className="flex items-start gap-2.5 text-xs leading-relaxed text-neutral-500">
      <span aria-hidden className="flex shrink-0 flex-col items-center gap-1.5">
        <span
          className="mt-[5px] h-1.5 w-1.5 rounded-full"
          style={{
            background: "var(--section-accent, var(--accent, #737373))",
            boxShadow:
              "0 0 8px color-mix(in srgb, var(--section-accent, var(--accent, #737373)) 65%, transparent)",
          }}
        />
        <span
          className="h-4 w-[3px] rounded-full"
          style={{
            background:
              "linear-gradient(180deg, var(--section-accent, var(--accent, #737373)), transparent)",
          }}
        />
      </span>
      <span>{PAGE_INTROS[section]}</span>
    </p>
  );
}
