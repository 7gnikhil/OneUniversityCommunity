import { THEMES, getTheme } from "@/lib/themes";
import { setMyThemeFormAction } from "@/app/profile/theme-actions";
import AnimatedDropdown from "@/components/AnimatedDropdown";

// Profile settings → Interface: the picker for the full-app look
// (profiles.theme_id). Interfaces are chosen HERE, from this list —
// the dial's long-press gesture now cycles the dial's own wheel
// styles instead (see components/DialSkinPicker). The list lives
// inside the shared AnimatedDropdown (closed by default; the header
// shows the current interface's name); the rows are still plain
// server-rendered forms posting to the same action.

export default function InterfacePicker({
  currentId,
  defaultId,
}: {
  /** The user's own saved pick (null = following the app default). */
  currentId: string | null;
  /** The admin's app-wide default interface id (null = seasonal). */
  defaultId: string | null;
}) {
  const defaultTheme = getTheme(defaultId);
  const followingDefault = currentId === null;

  const rows: Array<{
    id: string | null;
    name: string;
    vibe: string;
    meta: string;
    gradient: string;
    surface: string;
    accent: string;
    accent2: string;
    active: boolean;
  }> = [
    {
      id: null,
      name: "App Default",
      vibe: defaultTheme
        ? `Follow the app-wide default — currently ${defaultTheme.name}`
        : "Follow the app-wide default — currently the seasonal look",
      meta: defaultTheme
        ? `${defaultTheme.dialSkin} · ${defaultTheme.mode}`
        : "Seasonal",
      gradient: defaultTheme
        ? `linear-gradient(135deg, ${defaultTheme.tokens.bgFrom}, ${defaultTheme.tokens.bgTo})`
        : "linear-gradient(135deg, #000000, #262626)",
      surface: defaultTheme?.tokens.surface ?? "#0a0a0a",
      accent: defaultTheme?.tokens.accent ?? "#a3a3a3",
      accent2: defaultTheme?.tokens.accent2 ?? "#737373",
      active: followingDefault,
    },
    ...THEMES.map((theme) => ({
      id: theme.id as string | null,
      name: theme.name,
      vibe: theme.vibe,
      meta: `${theme.dialSkin} · ${theme.bgPattern} bg · ${theme.surfaceStyle} cards · ${theme.mode}`,
      gradient: `linear-gradient(135deg, ${theme.tokens.bgFrom}, ${theme.tokens.bgTo})`,
      surface: theme.tokens.surface,
      accent: theme.tokens.accent,
      accent2: theme.tokens.accent2,
      active: currentId === theme.id,
    })),
  ];

  return (
    <AnimatedDropdown
      title="Interface"
      currentLabel={
        followingDefault
          ? "App default"
          : (getTheme(currentId)?.name ?? "App default")
      }
    >
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        Your whole app&apos;s look — background, cards and the
        dial&apos;s home skin, not just colour. Pick from this list;
        your pick beats the app default and follows you on every
        device. (Holding the dial changes the dial&apos;s own style
        instead — see Dial style below.)
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <form key={row.id ?? "default"} action={setMyThemeFormAction}>
            <input type="hidden" name="themeId" value={row.id ?? ""} />
            <button
              type="submit"
              aria-pressed={row.active}
              className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                row.active
                  ? "border-neutral-400 bg-neutral-900"
                  : "border-neutral-800 hover:border-neutral-600"
              }`}
            >
              <span
                aria-hidden
                className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10"
                style={{ background: row.gradient }}
              >
                <span
                  className="absolute bottom-1.5 left-1.5 h-4 w-7 rounded-md border border-white/15"
                  style={{ background: row.surface }}
                />
                <span
                  className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full"
                  style={{ background: row.accent }}
                />
                <span
                  className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
                  style={{ background: row.accent2 }}
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
                <span className="block truncate text-[11px] text-neutral-500">
                  {row.meta}
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
