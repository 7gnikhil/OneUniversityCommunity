// Forgot password — the ONLY OTP flow in OneUco: an email OTP.
//
// Feature port TODO:
// - User enters account email -> server sends a one-time code via the email
//   provider (RESEND_API_KEY) -> user enters the code -> sets a new password.
// - Code expiry ~5 minutes, attempt limits and rate limiting.
// - Passwords are only ever stored as salted hashes (Supabase Auth / server).
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Forgot password</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — email-OTP password reset is ported here in the feature
        phase.
      </p>
    </main>
  );
}
