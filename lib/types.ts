// Shared domain types — hand-written starter set mirroring
// supabase/schema.sql. TODO: replace with generated types once the schema
// is applied to a project:
//   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts

export type Role = "student" | "admin" | "owner";
export type AccountStatus = "pending_verification" | "verified" | "rejected" | "suspended";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type ServerType = "public" | "friends_private" | "strangers_private";
export type Intention = "dating" | "friendship" | "study_partner" | "networking";

// The ONLY fields other students may ever see. Server responses for decks,
// search, profiles and Chirp must be built from this shape — private data
// (graduation year, college, phone) never leaves the server.
export interface PublicProfile {
  accountId: string;
  username: string;
  name: string;
  bio: string | null;
  branch: string | null;
  photoUrl: string | null;
  // Set ONLY on the masked developer projection (lib/social.ts
  // developerPublicProfile): the row is the OneUCo Developer with the
  // real name/@handle/photo stripped server-side. Renderers must treat
  // it as unlinkable — no profile link, no @handle — wherever it shows.
  developer?: boolean;
}

export interface Account {
  id: string;
  authUserId: string | null;
  oneucoId: string;
  username: string;
  email: string;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}
