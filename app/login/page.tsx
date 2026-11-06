// Login — password OR direct Google. There is NO OTP login anywhere;
// the only OTP in OneUco is the forgot-password email OTP.
//
// Feature port TODO:
// - Password login: single identifier field accepting OneUco ID, username
//   or email + password (verified server-side against the stored hash).
// - "Continue with Google" (Supabase Auth OAuth). If the Google email
//   matches an existing account it signs into it; if new, it flows into
//   sign-up -> student verification.
// - Separate Admin entry: "Admin — Continue with Google" + the admin
//   account's password. The owner's email is checked SERVER-SIDE only and
//   is never rendered in the UI. Admin role bypasses student verification
//   (Admin Pass) but never bypasses the password.
// - Log out kills the server session and returns here; a deleted session
//   cookie likewise ends access (no silent re-entry).
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">OneUco</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — login (password or Continue with Google) is ported here
        in the feature phase.
      </p>
    </main>
  );
}
