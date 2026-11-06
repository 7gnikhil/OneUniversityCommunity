import { diwaliLive, type DiwaliMode } from "@/lib/diwali";
import { setDiwaliModeAction } from "@/app/admin/diwali-actions";

// Admin control for the Diwali theme: Auto follows the launch window
// (8–12 Nov IST, self-off afterwards); On forces it (preview/extend);
// Off ends it immediately. Rendered on /admin only.
export default function DiwaliToggle({ mode }: { mode: DiwaliMode }) {
  const live: boolean = diwaliLive(mode);
  const options: { value: DiwaliMode; label: string; hint: string }[] = [
    { value: "auto", label: "Auto", hint: "Launch window 8–12 Nov, then off by itself" },
    { value: "on", label: "On", hint: "Force the theme on now" },
    { value: "off", label: "Off", hint: "End the theme immediately" },
  ];

  return (
    <section className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">🪔 Diwali theme</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            live ? "bg-amber-500/20 text-amber-300" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          {live ? "Live now" : "Not live"}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        Gold festive layer over the black theme — banner on login and the dial home. Current mode:{" "}
        <span className="text-neutral-300">{mode}</span>.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <form key={option.value} action={setDiwaliModeAction}>
            <input type="hidden" name="mode" value={option.value} />
            <button
              type="submit"
              title={option.hint}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                mode === option.value
                  ? "bg-amber-400 text-black hover:bg-amber-300"
                  : "border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
