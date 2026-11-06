import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";
import {
  getLatestVerification,
  listCollegeCodes,
  type VerificationRow,
} from "@/lib/profile";
import CompleteAccountForm from "./CompleteAccountForm";
import VerificationForm, {
  type VerificationInitial,
} from "./VerificationForm";

// /verify — the home of two steps for signed-in, not-yet-verified students
// (the middleware routes them here and nowhere else):
//   1. No accounts row yet  -> "Complete your account" (claim a @username;
//      the OneUco ID is generated server-side).
//   2. Account exists       -> the student verification flow: ID-card
//      uploads to the PRIVATE id-cards bucket + typed card fields +
//      hall-ticket structure check, then manual review.
// Admin Pass accounts and already-verified accounts get their status
// screens instead (they are never gated here, but may land here directly).
//
// There is NO public JNTU verification API — nothing here claims a live
// check against university records. A failed structure check is never a
// dead end: the submission still lands in 'pending' for a human to review.
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
          body="Your account carries an admin role, so student verification doesn't apply to you."
          cta={{ href: "/", label: "Go to OneUco" }}
        />
      ) : account?.status === "verified" ? (
        <StatusBlock
          title="You're verified"
          body="Your student verification is complete — everything is open."
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
              One last sign-up step: pick the @username other students will
              know you by. Your OneUco ID is generated for you — after this,
              student verification is the only thing left.
            </p>
          </div>
          <CompleteAccountForm />
        </section>
      ) : (
        <VerificationSection accountId={account.id} username={account.username} />
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

// The verification flow proper. Needs its own async component because it
// reads the student's latest attempt + the official college-code list.
async function VerificationSection({
  accountId,
  username,
}: {
  accountId: string;
  username: string;
}) {
  const supabase = await createClient();
  const [latest, collegeCodes] = await Promise.all([
    getLatestVerification(supabase, accountId),
    listCollegeCodes(supabase),
  ]);

  const initial = toInitial(latest);

  return (
    <section className="flex w-full flex-col gap-5">
      <div className="text-center">
        <h2 className="text-lg font-medium">Student verification</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          OneUco is for JNTUH students only. Upload your college ID card and
          confirm its details — a person reviews every submission, and
          nothing here can reject or ban you automatically.
        </p>
        <p className="mx-auto mt-3 w-fit rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
          @{username}
        </p>
      </div>

      {latest?.status === "pending" ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
          <p className="text-sm font-medium text-amber-300">
            Under review — you&apos;re in the queue
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
            Your submission is waiting for a manual review. You can update
            the photos or details below any time while it&apos;s pending —
            saving replaces what the reviewer sees.
          </p>
          <SubmittedDetails verification={latest} />
        </div>
      ) : latest?.status === "rejected" ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-left">
          <p className="text-sm font-medium text-red-300">
            The reviewer couldn&apos;t confirm this one
          </p>
          {latest.review_reason ? (
            <p className="mt-1 text-xs leading-relaxed text-red-200/80">
              Reason: {latest.review_reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs leading-relaxed text-red-200/70">
            That&apos;s not the end of it — fix what you can below, add an
            alternative proof (semester hall ticket, bonafide certificate or
            fee receipt), and submit again.
          </p>
          <SubmittedDetails verification={latest} />
        </div>
      ) : latest?.status === "verified" ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left">
          <p className="text-sm font-medium text-emerald-300">
            Verification approved
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/70">
            Your student status is confirmed. If parts of the app still look
            locked, log out and back in once.
          </p>
        </div>
      ) : null}

      {latest?.status !== "verified" ? (
        <VerificationForm
          accountId={accountId}
          collegeCodes={collegeCodes}
          initial={initial}
          submitLabel={
            latest?.status === "pending"
              ? "Save changes"
              : latest?.status === "rejected"
                ? "Submit again for review"
                : "Submit for review"
          }
        />
      ) : null}
    </section>
  );
}

function SubmittedDetails({
  verification,
}: {
  verification: VerificationRow;
}) {
  const fields = verification.parsed_fields;
  const rows: Array<[string, string]> = [];
  if (fields.name) rows.push(["Name on card", fields.name]);
  if (verification.hall_ticket) {
    rows.push(["Hall ticket", verification.hall_ticket]);
  }
  if (fields.college_name) rows.push(["College", fields.college_name]);
  if (fields.branch) rows.push(["Branch", fields.branch]);
  if (verification.claimed_grad_year) {
    rows.push(["Graduation year", String(verification.claimed_grad_year)]);
  }
  const proofCount = verification.alt_proofs.proofs?.length ?? 0;
  rows.push([
    "Proofs",
    `ID card front${verification.id_card_back_url ? " + back" : ""}${
      proofCount > 0 ? ` + ${proofCount} alternative` : ""
    }`,
  ]);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-3 flex flex-col gap-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-xs">
          <dt className="text-neutral-400">{label}</dt>
          <dd className="text-right font-medium text-neutral-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function toInitial(latest: VerificationRow | null): VerificationInitial | null {
  if (!latest) return null;
  const fields = latest.parsed_fields;
  return {
    name: fields.name ?? "",
    hallTicket: latest.hall_ticket ?? fields.hall_ticket ?? "",
    branch: fields.branch ?? "",
    collegeName: fields.college_name ?? "",
    collegeCode: latest.college_code ?? "",
    gradYear:
      latest.claimed_grad_year !== null
        ? String(latest.claimed_grad_year)
        : fields.grad_year !== undefined
          ? String(fields.grad_year)
          : "",
    frontPath: latest.id_card_front_url,
    backPath: latest.id_card_back_url,
    altProofs: latest.alt_proofs.proofs ?? [],
  };
}
