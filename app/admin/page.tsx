// Admin — owner/admin only. Guarded server-side by accounts.role
// ('owner' | 'admin'); regular students can never see this area.
//
// Feature port TODO:
// - Verification review queue: card photos (private `id-cards` bucket),
//   parsed fields, per-layer results, alternative proofs -> Approve /
//   Reject with a reason. Decisions are audit-logged.
// - ReqToAdmin queue (from the server flair system) and verification
//   appeals raised via ReqToAdmin.
// - Reports queue (`reports`), including Maya Jwalam posts — admins CAN
//   see the real author_id here for abuse handling (identity is hidden
//   from members only, never from moderation).
// - Developer requests inbox (`developer_requests`) with status updates.
// - Appoint / revoke admins (granting the role grants the Admin Pass:
//   verification bypass — but the admin password is still required).
// - College-code list maintenance (`college_codes`).
export default function AdminPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Admin</h1>
      <p className="text-sm text-neutral-500">
        Placeholder — the admin queues are ported here in the feature phase.
      </p>
    </main>
  );
}
