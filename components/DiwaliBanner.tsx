// Slim festive banner for the Diwali launch window. Rendered only when the
// theme is live (lib/diwali + app_settings mode); pure presentation — the
// black/minimal base is untouched and the banner removes itself when the
// window ends or the owner toggles it off.
export default function DiwaliBanner({ variant }: { variant: "login" | "app" }) {
  return (
    <div
      role="note"
      className="relative w-full overflow-hidden border-b border-amber-500/30 bg-gradient-to-r from-amber-950/80 via-yellow-900/40 to-amber-950/80 px-4 py-2 text-center"
    >
      <span aria-hidden className="pointer-events-none absolute left-[12%] top-1/2 -translate-y-1/2 animate-pulse text-[10px] text-amber-300/80">
        ✦
      </span>
      <span aria-hidden className="pointer-events-none absolute right-[18%] top-1 text-[8px] text-amber-200/60 animate-pulse">
        ✦
      </span>
      <span aria-hidden className="pointer-events-none absolute right-[8%] bottom-1 text-[10px] text-amber-300/70 animate-pulse">
        ✦
      </span>
      <p className="text-xs font-medium tracking-wide text-amber-200">
        🪔 Happy Diwali
        {variant === "login" ? (
          <span className="text-amber-200/70"> — OneUco launches today. Welcome in.</span>
        ) : (
          <span className="text-amber-200/70"> — welcome to OneUco</span>
        )}
      </p>
    </div>
  );
}
