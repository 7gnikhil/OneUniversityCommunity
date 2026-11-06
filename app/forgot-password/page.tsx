import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

// Forgot password — the ONLY OTP-style flow in OneUco, and it is email
// only (no SMS / phone codes anywhere in the app): Supabase emails a
// reset link that expires quickly (~5 minutes in our copy/messaging),
// lands via /auth/callback, and continues to /reset-password.
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot password</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          Enter the email on your OneUco account and we&apos;ll email you a
          password-reset link.
        </p>
      </div>

      <ForgotPasswordForm />

      <Link href="/login" className="text-sm text-neutral-400 transition hover:text-white">
        ← Back to log in
      </Link>
    </main>
  );
}
