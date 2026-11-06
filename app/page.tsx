import Link from "next/link";
import DialNav from "@/components/DialNav";
import LiveClock from "@/components/LiveClock";

// Dial Home — the app's home screen (signed-in, verified users land here;
// the middleware sends everyone else to /login or the /verify shell).
//
// Ported in this slice: the round rotating dial with its five stops, the
// OneUco wordmark header and the small live clock line, on the black
// minimal theme. Still to port (later slices): the rotary-dial sound,
// unread-count badges on the stops, and the desktop wide layout.
export default function DialHomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-6">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">OneUco</h1>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
        <LiveClock />
      </header>

      <div className="flex flex-1 items-center justify-center py-10">
        <DialNav />
      </div>

      <footer className="flex items-center justify-center gap-6 pb-2 text-xs text-neutral-500">
        <Link href="/inbox" className="transition hover:text-white">
          Inbox
        </Link>
        <Link href="/profile" className="transition hover:text-white">
          Settings
        </Link>
      </footer>
    </main>
  );
}
