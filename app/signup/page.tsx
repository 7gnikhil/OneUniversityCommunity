import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import SignupForm from "./SignupForm";

// Sign up — email + password, or Google. Any personal email works; a
// college email is never needed. After sign-up the student lands on
// /verify to claim a username + OneUco ID and add self-declared study
// details. There is no email-confirmation step and no OTP sign-up anywhere
// in OneUco.
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
        OneUco is open to students of any college or university. Use any
        personal email — no college email is needed. After signing up
        you&apos;ll claim your username and add a few study details before
        you can use the app. No documents needed.
      </p>
    </main>
  );
}
