import { getTheme } from "@/lib/themes";
import { DIAL_SKINS, type DialSkinId } from "@/lib/dial-skins";
import { setMyDialSkinFormAction } from "@/app/profile/theme-actions";
import AnimatedDropdown from "@/components/AnimatedDropdown";

// Profile settings → Dial style: the list twin of the dial's
// long-press wheel-style mode (hold the dial → swipe → tap centre).
// Same action, same profiles.dial_skin — this list is for anyone who
// would rather tap than hold-and-swipe. 'Auto' (the first row) means
// the wheel wears the applied interface's own skin. Like the
// Interface picker above it, the list lives inside the shared
// AnimatedDropdown; the rows are plain server-rendered forms.

export default function DialSkinPicker({
  currentId,
  appliedThemeId,
}: {
  /** The user's own saved wheel pick ('auto' = interface's skin). */
  currentId: DialSkinId;
  /** The interface applied to the user (names the Auto row's skin). */
  appliedThemeId: string | null;
}) {
  const appliedTheme = getTheme(appliedThemeId);

  const rows: Array<{
    id: DialSkinId;
    name: string;
    vibe: string;
    face: string;
    ring: string;
    active: boolean;
  }> = [
    {
      id: "auto",
      name: "Auto — interface skin",
      vibe: appliedTheme
        ? `The wheel wears your interface's skin — ${appliedTheme.dialSkin}`
        : "The wheel wears your interface's own skin",
      face: appliedTheme?.tokens.dial.face ?? "#131316",
      ring: appliedTheme?.tokens.dial.ring ?? "#27272a",
      active: currentId === "auto",
    },
    ...DIAL_SKINS.map((skin) => ({
      id: skin.id as DialSkinId,
      name: skin.name,
      vibe: skin.vibe,
      face: skin.tokens.face,
      ring: skin.tokens.ring,
      active: currentId === skin.id,
    })),
  ];

  return (
    <AnimatedDropdown
      title="Dial style"
      currentLabel={
        currentId === "auto"
          ? "Auto"
          : (DIAL_SKINS.find((skin) => skin.id === currentId)?.name ??
            "Auto")
      }
    >
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        The wheel itself — a pirate helm, car wheels, or your
        interface&apos;s own skin. It changes only the dial, never the
        app. Tip: you can also{" "}
        <span className="text-neutral-300">hold the dial</span> anywhere
        and swipe through these live.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <form key={row.id} action={setMyDialSkinFormAction}>
            <input type="hidden" name="dialSkinId" value={row.id} />
            <button
              type="submit"
              aria-pressed={row.active}
              className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                row.active
                  ? "border-neutral-400 bg-neutral-900"
                  : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              {/* Mini wheel: the skin's face + ring + a hub dot. */}
              <span
                aria-hidden
                className="relative h-11 w-11 shrink-0 rounded-full border-2"
                style={{ background: row.face, borderColor: row.ring }}
              >
                <span
                  className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/25"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-white">
                  {row.name}
                  {row.active ? (
                    <span className="ml-2 text-[11px] font-medium text-neutral-400">
                      · on now
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  {row.vibe}
                </span>
              </span>
              <span className="shrink-0 text-neutral-500">→</span>
            </button>
          </form>
        ))}
      </div>
    </AnimatedDropdown>
  );
}
