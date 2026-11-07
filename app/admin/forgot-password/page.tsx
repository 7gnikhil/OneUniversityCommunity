import Link from "next/link";
import AdminForgotPasswordForm from "./AdminForgotPasswordForm";

// Admin password recovery — separate from the student /forgot-password
// flow (owner rule, 2026-11-07): reset links for the admin door are
// emailed only for the owner's own address. The action answers every
// submission with the same neutral confirmation, so this page never
// reveals which email that is. No email address is shown here.
export default function AdminForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          OneUCo Developer
        </p>
        <p className="mt-3 text-sm text-neutral-400">Password recovery</p>
      </div>

      <AdminForgotPasswordForm />

      <p className="text-center text-xs leading-relaxed text-neutral-600">
        A reset link is emailed only if the address entered can recover
        the admin account — every other address gets the same confirmation
        and no email.
      </p>

      <Link
        href="/admin/login"
        className="text-sm text-neutral-400 transition hover:text-white"
      >
        ← Back to admin sign-in
      </Link>
    </main>
  );
}
