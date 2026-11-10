import { PAGE_INTROS, type PageIntroSection } from "@/lib/page-intros";

// The permanent one-line brief at the top of a section (see
// lib/page-intros). Rendered on every page open — it is part of the
// page furniture, not a tip: nothing to dismiss, nothing remembered.
//
// Styling: small muted text with an accent dot. The dot reads the
// applied interface's --accent token (stamped on <html> by the root
// layout when an interface applies) and falls back to a neutral grey
// in the seasonal look; the text tone is text-neutral-500, which the
// interfaces' CSS remaps to their muted tone — so the line sits
// correctly in dark themes, light themes and the classic look alike.
export default function PageIntro({ section }: { section: PageIntroSection }) {
  return (
    <p className="flex items-start gap-2.5 text-xs leading-relaxed text-neutral-500">
      <span
        aria-hidden
        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--accent, #737373)" }}
      />
      <span>{PAGE_INTROS[section]}</span>
    </p>
  );
}
