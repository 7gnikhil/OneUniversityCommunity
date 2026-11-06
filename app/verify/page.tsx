import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getAccountByAuthUserId,
  passesAdminGate,
  type AccountRow,
} from "@/lib/auth/account";
import { listCollegeCodes } from "@/lib/profile";
import CompleteAccountForm from "./CompleteAccountForm";
import CompleteProfileForm, {
  type CompleteProfileInitial,
} from "./CompleteProfileForm";

// /verify — despite the route name, there is no document verification here
// any more. This page is where a signed-in student finishes joining (the
// middleware routes anyone who has not completed it here):
//   1. No accounts row yet -> "Complete your account" (claim a @username;
//      the OneUco ID is generated server-side). This is the main step.
//   2. Account exists but is not active yet -> "Complete your profile":
//      self-declared college / university, branch and graduation year.
//      No documents, no uploads, no checks — saving activates the account
//      immediately.
// Admin Pass accounts and already-active accounts get their status screens
// instead (they are never gated here, but may land here directly). The old
// verifications table is dormant and is not read or written by this page.
export default async function VerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;
  const admin = passesAdminGate(user?.email, account);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-6 p-6">
      <div className="mt-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">OneUco</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
      </div>

      {admin ? (
        <StatusBlock
          title="Admin Pass active"
          body="Your account carries an admin role, so student profile completion doesn't apply to you."
          cta={{ href: "/", label: "Go to OneUco" }}
        />
      ) : account?.status === "verified" ? (
        <StatusBlock
          title="You're in"
          body="Your profile is complete — everything is open."
          cta={{ href: "/", label: "Go to OneUco" }}
        />
      ) : account?.status === "suspended" ? (
        <StatusBlock
          title="Account suspended"
          body="This account has been suspended by the OneUCo Developer. If you think this is a mistake, reach out through the Help section once you're back in."
        />
      ) : !account ? (
        <section className="flex w-full flex-col items-center gap-4">
          <div className="text-center">
            <h2 className="text-lg font-medium">Complete your account</h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">
              Start by picking the @username other students will know you
              by. Your OneUco ID is generated for you — after this, you just
              add a few study details and you&apos;re in. No documents
              needed.
            </p>
          </div>
          <CompleteAccountForm />
        </section>
      ) : (
        <ProfileCompletionSection account={account} />
      )}

      <form action="/auth/logout" method="post" className="mt-auto pt-4">
        <button
          type="submit"
          className="text-sm font-medium text-red-400 transition hover:text-red-300"
        >
          Log out
        </button>
      </form>
    </main>
  );
}

function StatusBlock({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm leading-relaxed text-neutral-400">{body}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

// The self-declaration step. Needs its own async component because it reads
// the open college registry (approved colleges + this student's own pending
// additions) for the form's select.
async function ProfileCompletionSection({
  account,
}: {
  account: AccountRow;
}) {
  const supabase = await createClient();
  const collegeCodes = await listCollegeCodes(supabase, account.id);

  const initial: CompleteProfileInitial = {
    collegeCode: account.college_code ?? "",
    collegeName: account.college_name ?? "",
    branch: account.branch ?? "",
    gradYear:
      account.graduation_year !== null ? String(account.graduation_year) : "",
  };

  return (
    <section className="flex w-full flex-col gap-5">
      <div className="text-center">
        <h2 className="text-lg font-medium">Complete your profile</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          OneUco is open to students of any college or university. No
          documents needed — just tell us where you study. Pick or add your
          college, add your branch and graduation year, and you&apos;re in
          straight away. These details stay private.
        </p>
        <p className="mx-auto mt-3 w-fit rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
          @{account.username}
        </p>
      </div>

      <CompleteProfileForm collegeCodes={collegeCodes} initial={initial} />
    </section>
  );
}
