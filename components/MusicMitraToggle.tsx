import { setMusicMitraEnabledAction } from "@/app/admin/music-actions";

// Admin kill-switch for Music Mitra (owner's call, 2026-11-17):
// Off hides the Mitra tab, unmounts the player, pauses /radio and
// /api/radio — built for the day a takedown or a rights notice makes
// the music a liability. On restores everything. Rendered on /admin.
export default function MusicMitraToggle({ enabled }: { enabled: boolean }) {
  return (
    <section className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">🎵 Music Mitra kill-switch</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            enabled
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          {enabled ? "Music is ON" : "Music is OFF"}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        Turning music OFF hides the Mitra tab, stops the player, pauses
        the Music Mitra page and its API — instantly, no deploy. Use it
        if a takedown or rights notice ever lands. Profile covers
        (students&apos; own recordings) are not affected.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={setMusicMitraEnabledAction}>
          <input type="hidden" name="enabled" value="on" />
          <button
            type="submit"
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              enabled
                ? "bg-emerald-400 text-black hover:bg-emerald-300"
                : "border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
            }`}
          >
            Music ON
          </button>
        </form>
        <form action={setMusicMitraEnabledAction}>
          <input type="hidden" name="enabled" value="off" />
          <button
            type="submit"
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              !enabled
                ? "bg-red-400 text-black hover:bg-red-300"
                : "border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
            }`}
          >
            Kill music
          </button>
        </form>
      </div>
    </section>
  );
}
