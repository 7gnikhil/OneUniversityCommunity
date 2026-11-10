import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId } from "@/lib/auth/account";
import { getProfileByAccountId } from "@/lib/profile";
import { listMyDeveloperRequestsAction } from "./actions";
import { accentHex } from "@/lib/validation";
import DeveloperRequestForm from "./DeveloperRequestForm";
import { FAQS, RULES } from "@/lib/help-content";

// Help — FAQ + community rules, written from how OneUco actually works —
// and the home of "Req to Developer" (linked from Profile → Settings).
// The request form is the developer contact; no email is published.
// The FAQ/rule strings live in lib/help-content.ts, shared with
// Profile & Settings → About & FAQs so the two never drift apart.

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
