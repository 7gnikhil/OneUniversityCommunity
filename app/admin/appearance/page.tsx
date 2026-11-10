import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { THEMES, getTheme, type AppTheme } from "@/lib/themes";
import { getThemeSetting } from "@/lib/server/theme-settings";
import { setAppThemeAction } from "./actions";

// Admin — Appearance: pick the app-wide DEFAULT interface.
//
// An interface is the whole look — palette, dial skin, background
// pattern, card style — not just a colour. This default is what every
// student gets UNTIL they pick their own: any student can long-press
// the dial and swipe to their own interface, and their pick wins over
// this default (resolution: profiles.theme_id > this setting >
// seasonal auto). "Auto (seasonal)" hands the look back to the
// seasonal logic (the Diwali window etc.), exactly as before themes.

function ThemeCard({
  theme,
  active,
}: {
  theme: AppTheme;
  active: boolean;
}) {
  const t = theme.tokens;
  return (
    <form action={setAppThemeAction}>
      <input type="hidden" name="themeId" value={theme.id} />
      <button
        type="submit"
        aria-pressed={active}
        className={`w-full overflow-hidden rounded-2xl border text-left transition ${
          active
            ? "border-neutral-300"
            : "border-neutral-800 hover:border-neutral-600"
        }`}
      >
        {/* Live mini-preview in the interface's own tokens: page
            gradient, a surface card, its dial-skin face and accents. */}
        <span
          aria-hidden
          className="relative block h-24"
          style={{
            background: `linear-gradient(135deg, ${t.bgFrom}, ${t.bgTo})`,
          }}
        >
          <span
            className="absolute left-3 top-3 block h-10 w-16 rounded-lg border"
            style={{ background: t.surface, borderColor: t.border }}
          />
          <span
            className="absolute bottom-3 left-3 block h-9 w-9 rounded-full border-2"
            style={{
              background: t.dial.face,
              borderColor: t.dial.ring,
              boxShadow: t.dial.glow !== "none" ? t.dial.glow : undefined,
              backdropFilter: t.dial.blur || undefined,
            }}
          />
          <span
            className="absolute right-3 top-3 block h-3 w-3 rounded-full"
            style={{ background: t.accent }}
          />
          <span
            className="absolute bottom-3 right-3 block h-3 w-3 rounded-full"
            style={{ background: t.accent2 }}
          />
          {active ? (
            <span className="absolute right-3 top-8 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black">
              Live default
            </span>
          ) : null}
        </span>
        <span className="block bg-neutral-950 p-3">
          <span className="block text-sm font-medium text-white">
            {theme.name}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-400">
            {theme.vibe}
          </span>
          <span className="mt-1 block text-[11px] text-neutral-500">
            {theme.dialSkin} dial · {theme.bgPattern} background ·{" "}
            {theme.surfaceStyle} cards · {theme.mode}
          </span>
        </span>
      </button>
    </form>
  );
}

export default async function AdminAppearancePage() {
  await requireAdminPage();
  const setting = await getThemeSetting();
  const manual = setting.mode === "manual";
  const activeId = setting.mode === "manual" ? setting.id : null;
  const activeTheme = getTheme(activeId);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            OneUCo Developer
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-neutral-400 transition hover:text-white"
        >
          ← Admin
        </Link>
      </header>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <p className="text-sm leading-relaxed text-neutral-300">
          This is the <span className="text-white">app-wide default interface</span> —
          the full look (dial skin, background, cards, colours) that students
          get if they haven&apos;t picked their own. Any student can
          long-press the dial and choose their own interface; their pick
          always wins over this default.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Current default:{" "}
          <span className="text-neutral-300">
            {manual
              ? (activeTheme?.name ?? "Manual")
              : "Auto (seasonal — e.g. the Diwali window)"}
          </span>
          . Changes apply to everyone on the default, app-wide, within a
          minute.
        </p>
        <form action={setAppThemeAction} className="mt-3">
          <input type="hidden" name="themeId" value="auto" />
          <button
            type="submit"
            aria-pressed={!manual}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              !manual
                ? "bg-white text-black hover:bg-neutral-200"
                : "border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
            }`}
          >
            Auto (seasonal)
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {THEMES.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            active={activeId === theme.id}
          />
        ))}
      </section>

      <p className="text-xs leading-relaxed text-neutral-600">
        Interfaces restyle the page ground, cards, borders, text tones,
        primary buttons and the dial (skin, glow, ticks). Semantic colours
        stay fixed on purpose — online dots stay green, report actions stay
        red, warnings stay amber — and photos/avatars are never tinted.
      </p>
    </main>
  );
}
