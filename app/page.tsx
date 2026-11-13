import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAccount } from "@/lib/auth/my-account";
import { STOPS } from "@/lib/nav-stops";

// Root — the public front door (2026-11-13). Signed-in users never
// see this: the middleware sends verified users at / straight to
// /swipe (the app opens on Fling), and this page redirects any
// signed-in account the middleware let through. Signed-OUT visitors
// get the landing page: what OneUco is, why students join, and how
// it is different — before anyone asks them to sign in. (Before
// this, the root bounced strangers straight to /login.)
//
// Copy rules: only what the app actually does today. Open to
// students of every college; personal email or Google sign-up; no
// college email, no ID card; college/branch/year are declared by
// the student and kept private. No screenshots — the sections are
// described, not faked.

const SECTIONS: Record<string, { title: string; body: string }> = {
  "/swipe": {
    title: "Fling — meet students",
    body: "Swipe through students from colleges everywhere, match, and chat. Your ★ rating climbs with every right swipe you earn this week.",
  },
  "/chirp": {
    title: "Chirp — the all-college feed",
    body: "Posts from students across universities, plus live campus and national news — one feed that is not locked to a single campus.",
  },
  "/servers": {
    title: "Tea — student communities",
    body: "Group spaces for branches, clubs and interests. Home of Maya Jwalam, the anonymous channel where posts carry no name at all.",
  },
  "/friends": {
    title: "Homies — friends & chats",
    body: "Your people, your DMs. Profiles open up more — galleries, portfolios — only for friends you have accepted.",
  },
  "/profile": {
    title: "Profile — your student identity",
    body: "Your @username and OneUco ID. Your college, branch and year stay private — you declare them, nobody checks your ID card.",
  },
};

const DIFFERENCES: { title: string; body: string }[] = [
  {
    title: "Not locked to one college",
    body: "Most student apps stop at one campus gate. OneUco is built cross-college from day one — an Anurag student can talk to a JNTUH, CBIT or IIT student in the same feed.",
  },
  {
    title: "No college-email gate",
    body: "Sign up with your personal email or Google and you are in. No waiting on a college inbox you may not even have.",
  },
  {
    title: "Everything in one app",
    body: "Meeting people, a campus feed, communities, friends and an anonymous channel — one app instead of five one-trick ones.",
  },
  {
    title: "Private by default",
    body: "Your college details are never shown publicly, and your fuller profile unlocks only for friends you accept.",
  },
];

export default async function RootPage() {
  const supabase = await createClient();
  const account = await getMyAccount(supabase);
  if (account) redirect("/swipe");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-16 pt-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          One<span className="text-amber-400">Uco</span>
        </span>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-300 transition hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Join OneUco
          </Link>
        </nav>
      </header>

      <section className="mt-14 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-400">
          One University Community
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight">
          Every college.
          <br />
          One community.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-neutral-400">
          OneUco is the social app for students of <em>every</em> college
          and university — meet students beyond your campus, follow one
          all-college feed, and hang out in communities built by
          students, for students.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="w-full max-w-xs rounded-full bg-amber-400 px-6 py-3 text-center text-base font-semibold text-black transition hover:bg-amber-300"
          >
            Join OneUco — it&apos;s free
          </Link>
          <p className="text-xs text-neutral-500">
            Personal email or Google. No college email. No ID card.
          </p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">
          What&apos;s inside
        </h2>
        <div className="mt-5 flex flex-col gap-3">
          {STOPS.map((stop) => {
            const section = SECTIONS[stop.href];
            if (!section) return null;
            return (
              <article
                key={stop.href}
                className="rounded-3xl border border-neutral-800 bg-neutral-950 px-5 py-4"
              >
                <h3
                  className="text-base font-semibold"
                  style={{ color: stop.accentVar }}
                >
                  {section.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                  {section.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">
          Why students switch
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {DIFFERENCES.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-neutral-800 bg-neutral-950 px-5 py-4"
            >
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 text-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-500">
          In in three steps
        </h2>
        <ol className="mx-auto mt-5 flex max-w-md flex-col gap-3 text-left">
          {[
            "Sign up free with your personal email or Google.",
            "Claim your @username and OneUco ID.",
            "Declare your college — it stays private — and start meeting students.",
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-black">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-neutral-300">
                {step}
              </span>
            </li>
          ))}
        </ol>
        <Link
          href="/signup"
          className="mt-10 inline-block w-full max-w-xs rounded-full bg-amber-400 px-6 py-3 text-center text-base font-semibold text-black transition hover:bg-amber-300"
        >
          Create your account
        </Link>
      </section>

      <footer className="mt-16 flex flex-col items-center gap-2 border-t border-neutral-900 pt-6 text-xs text-neutral-600">
        <p>OneUco — One University Community. For students, by students.</p>
        <p className="flex gap-4">
          <Link href="/privacy" className="transition hover:text-neutral-400">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-neutral-400">
            Terms
          </Link>
          <Link href="/login" className="transition hover:text-neutral-400">
            Log in
          </Link>
        </p>
      </footer>
    </main>
  );
}
