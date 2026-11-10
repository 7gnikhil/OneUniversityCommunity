import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { listMyDeveloperRequestsAction } from "./actions";
import { accentHex } from "@/lib/validation";
import DeveloperRequestForm from "./DeveloperRequestForm";

// Help — FAQ + community rules, written from how OneUco actually works —
// and the home of "Req to Developer" (linked from Profile → Settings).
// The request form is the developer contact; no email is published.
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Who can join OneUco?",
    a: "Any college or university student. Sign up with a personal email (or Google), claim your @username and OneUco ID, and declare your college, branch and graduation year. No ID-card checking, no college email needed — completing the declaration activates your account.",
  },
  {
    q: "What can other students see about me?",
    a: "Only your public profile: photo, name, bio and branch. Your college, graduation year, email and phone stay private on your account and are never shown to other students.",
  },
  {
    q: "How does Fling work?",
    a: "Like someone and if they like you back, it's a match and a chat opens in Homies. Your intention and preferences (Profile → Settings) shape who you see; everything defaults to \"Any\" and nothing is mandatory.",
  },
  {
    q: "What is Maya Jwalam?",
    a: "The main channel — every OneUco student, posting anonymously. Nobody there can see your name, @username, OneUco ID or photo, and there's no member list to browse. If someone asks \"show me your profile\" on your post, the request lands in your Inbox: accept to share your public profile with just that person (revocable any time), or decline and stay anonymous.",
  },
  {
    q: "What is Tea?",
    a: "Tea is where the group hangouts live: public ones anyone can join, and private ones (among friends, or among strangers) that need an invite code, an invite link, or a direct add from a member. Mods and admins can tag messages with flairs; flagging your own message ReqToAdmin sends it to the admin queue.",
  },
  {
    q: "Can I have two accounts with the same email?",
    a: "No — one account per email, enforced by the database. If sign-up says an account already exists, just log in instead. Your username and OneUco ID are unique too.",
  },
  {
    q: "How do I reach the developer?",
    a: "Use the Req to Developer form below — it's the contact channel. Pick a type (change, add-on, bug, other), describe it, and track the status here and in your Inbox: Received → Planned → Done, or Declined.",
  },
];

const RULES: string[] = [
  "Be a real student, and be yourself — one account per person, no impersonation.",
  "Respect anonymity: never try to identify a Maya Jwalam poster who hasn't revealed themselves to you, and never share someone else's revealed identity onwards.",
  "No harassment, hate speech, spam or scams — in chats, teas, Chirps or reveal requests. Blocks are absolute: a blocked person stays blocked.",
  "Keep photos and posts appropriate for a student community; anything sexual involving minors is banned outright and reported.",
  "Admins can remove posts, revoke reveals and suspend accounts that break these rules. Use the ReqToAdmin flair or a report to flag problems.",
];

export default async function HelpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;
  const myProfile = account ? await getProfileByAccountId(supabase, account.id) : null;
  const accent = accentHex(myProfile?.accent_color);
  const myRequests = account ? await listMyDeveloperRequestsAction() : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link href="/profile" className="text-sm text-neutral-400 transition hover:text-white">
          ← Profile &amp; Settings
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Help
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">How OneUco works</h1>
        {FAQS.map((faq) => (
          <details
            key={faq.q}
            className="rounded-3xl border border-neutral-800 bg-neutral-950 px-4 py-3"
          >
            <summary className="cursor-pointer text-sm font-medium">{faq.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{faq.a}</p>
          </details>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Community rules</h2>
        <ul className="flex list-disc flex-col gap-1.5 rounded-3xl border border-neutral-800 bg-neutral-950 px-6 py-4 text-sm leading-relaxed text-neutral-300">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section id="req-to-developer" className="scroll-mt-6">
        <DeveloperRequestForm initialRequests={myRequests} accentHex={accent} />
      </section>
    </main>
  );
}
