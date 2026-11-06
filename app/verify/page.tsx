import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountByAuthUserId, passesAdminGate } from "@/lib/auth/account";

// Verification-pending shell. The middleware routes every signed-in,
// not-yet-verified student here and lets them reach ONLY this page and
// sign-out until their account status is 'verified' (admins — Admin Pass —
// are never routed here).
//
// The verification pipeline itself is the next slice (kept from the
// scaffold plan): ID-card upload to the PRIVATE `id-cards` bucket +
// field-based OCR parse -> hall-ticket structure check against
// `college_codes` -> optional college-email proof -> admin manual-review
// queue for anything doubtful. A failed auto-check is never a dead end:
// the student waits here in 'pending' and can retry / submit alternative
// proofs / appeal. There is NO public JNTU verification API — UI copy must
// never claim a live check against university records.
export default async function VerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const account = user ? await getAccountByAuthUserId(supabase, user.id) : null;
  const admin = passesAdminGate(user?.email, account);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">OneUco</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
      </div>

      {admin ? (
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-medium">Admin Pass active</h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            Your account carries an admin role, so student verification
            doesn&apos;t apply to you.
          </p>
          <Link
            href="/"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            Go to OneUco
          </Link>
        </div>
      ) : account?.status === "verified" ? (
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-medium">You&apos;re verified</h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            Your student verification is complete — everything is open.
          </p>
          <Link
            href="/"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            Go to OneUco
          </Link>
        </div>
      ) : account?.status === "suspended" ? (
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-medium">Account suspended</h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            This account has been suspended by the OneUCo Developer. If you
            think this is a mistake, reach out through the Help section once
            you&apos;re back in.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-medium">Verification pending</h2>
          <p className="text-sm leading-relaxed text-neutral-400">
            OneUco is for JNTUH students only, so your account needs student
            verification before the app opens up. The ID-card verification
            step launches here next — until then, this page is where you
            land, and nothing about your account is blocked or rejected.
          </p>
          {account ? (
            <p className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
              @{account.username} · status:{" "}
              {account.status === "rejected"
                ? "needs another look"
                : "pending verification"}
            </p>
          ) : (
            <p className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400">
              Finishing sign-up is the next step for this account.
            </p>
          )}
        </div>
      )}

      <form action="/auth/logout" method="post">
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
