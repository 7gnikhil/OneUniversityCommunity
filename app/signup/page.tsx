import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import SignupForm from "./SignupForm";

// Sign up — email + password, or Google. Either way the account starts
// with NO app access: after sign-up the student lands on /verify to claim
// a username + OneUco ID and complete ID-card verification (Slice 2).
// There is no email-confirmation step — ID verification is the gate (see
// app/signup/actions.ts) — and no OTP sign-up anywhere in OneUco.
export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">OneUco</h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          One University Community
        </p>
      </div>

      <SignupForm />

      <div className="flex w-full items-center gap-3 text-[11px] uppercase tracking-widest text-neutral-600">
        <span className="h-px flex-1 bg-neutral-800" />
        or
        <span className="h-px flex-1 bg-neutral-800" />
      </div>

      <GoogleSignInButton label="Sign up with Google" nextPath="/verify" />

      <p className="text-sm text-neutral-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-white transition hover:text-neutral-300"
        >
          Log in
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-neutral-600">
        OneUco is for JNTUH students only. After signing up you&apos;ll
        verify with your college ID card before you can use the app.
      </p>
    </main>
  );
}
