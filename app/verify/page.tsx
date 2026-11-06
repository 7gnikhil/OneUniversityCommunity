// Student verification — JNTUH students only. Layered, no single point of
// trust, and a failed auto-check is NEVER a dead end.
//
// Feature port TODO (pipeline runs server-side, results stored in
// `verifications` with per-layer pass/fail + audit fields):
// 1. ID-card upload + field-based OCR parse (no fixed card template — each
//    affiliated college issues its own design). Parse labelled fields:
//    name, hall ticket no. (10 chars), course, branch, college name,
//    validity year, photo / principal seal presence. Original card image
//    goes to the PRIVATE `id-cards` storage bucket.
// 2. Hall-ticket structure check: joining year + college code + branch code
//    + roll (fictional example: 22XY101Z99 -> joined 2022, college code
//    XY, branch 101).
//    College code must exist in `college_codes` (official JNTUH list) and
//    joining year + 4 must equal the claimed graduation year (+3 lateral).
// 3. Optional institutional college-email OTP — strongest proof signal;
//    students without a college email fall through to review, not rejection.
// 4. One account per roll number: `verifications.hall_ticket` is unique
//    among verified rows at the database level.
// 5. Anything doubtful -> admin manual-review queue (/admin) with parsed
//    fields + layer results; approve/reject with a reason. The student sits
//    in a "verification pending" state meanwhile (can log in, no full access)
//    and can retry with front+back photos, submit alternative proofs
//    (semester hall ticket, bonafide certificate, fee receipt) or appeal
//    via a ReqToAdmin from this screen.
// Honest limit: there is NO public JNTU verification API — never claim a
// live check against university records anywhere in UI copy.
export default function VerifyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Verify you&apos;re a student</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — the layered ID verification flow is ported here in the
        feature phase.
      </p>
    </main>
  );
}
