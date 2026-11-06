import ResetPasswordForm from "./ResetPasswordForm";

// Set a new password — reached only via the emailed reset link
// (/forgot-password -> email -> /auth/callback -> here), which establishes
// the recovery session this page updates.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          Choose a new password for your OneUco account.
        </p>
      </div>

      <ResetPasswordForm />
    </main>
  );
}
