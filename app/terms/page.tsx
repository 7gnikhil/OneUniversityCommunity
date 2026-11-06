import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — OneUco",
  description: "The basic rules for using OneUco.",
};

// Public page (no sign-in required), linked from Google OAuth branding.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-neutral-200">
      <h1 className="text-2xl font-semibold text-white">OneUco — Terms of Service</h1>
      <p className="mt-2 text-sm text-neutral-400">
        One University Community. Last updated: 7 November 2026.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-base font-semibold text-white">Eligibility</h2>
        <p>
          OneUco is only for current students of JNTUH-affiliated colleges who
          complete the in-app student verification. One account per student:
          an account is tied to one hall-ticket number. Impersonating another
          person or using someone else&rsquo;s ID card is not allowed and
          leads to removal.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Acceptable use</h2>
        <p>
          Be respectful. Harassment, hate speech, spam, scams, sharing another
          person&rsquo;s private information, and illegal content are
          prohibited. Content in the anonymous main channel is still moderated:
          anonymity hides your identity from other students, not from the
          administrator.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Moderation</h2>
        <p>
          The administrator may remove content, restrict features, or suspend
          accounts that break these terms or put other students at risk.
          Reports and blocks are available in the app.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Your content</h2>
        <p>
          You are responsible for what you post. You keep ownership of your
          content and give OneUco permission to store and display it as needed
          to run the app.
        </p>

        <h2 className="pt-4 text-base font-semibold text-white">Service</h2>
        <p>
          OneUco is a student-built service provided as-is; features may change
          and the service may be interrupted or discontinued. Questions and
          requests go through the in-app &ldquo;Req to Developer&rdquo; form
          (Profile → Settings → Help).
        </p>
      </section>
    </main>
  );
}
