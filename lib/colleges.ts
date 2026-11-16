// Built-in college list — Hyderabad, Telangana & Andhra Pradesh.
// Ships in the app (lib/colleges-data.json) so every student can pick
// their college directly at signup without waiting for the database
// registry to be seeded. The same list is seeded into college_codes by
// supabase/migration-0018-colleges-ts-ap.sql, and completeProfileAction
// auto-registers a picked college (approved) on first use, so the list
// works even before that migration is applied.
// Pure data + helpers — safe in Server Components, server actions and
// Client Components alike (same pattern as lib/validation.ts).

import rawColleges from "./colleges-data.json";
import { normaliseCollegeName } from "./validation";

export type CollegeState = "Telangana" | "Andhra Pradesh";

export interface ListedCollege {
  name: string;
  city: string;
  state: CollegeState;
  type: string;
  /** Stable id used as the form value: "listed:<slug>". */
  slug: string;
}

export function collegeSlug(name: string, city: string): string {
  const base = `${name} ${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 120);
}

export const LISTED_COLLEGES: ListedCollege[] = (
  rawColleges as Array<{
    name: string;
    city: string;
    state: string;
    type: string;
  }>
).map((row) => ({
  name: row.name,
  city: row.city,
  state: row.state as CollegeState,
  type: row.type,
  slug: collegeSlug(row.name, row.city),
}));

export const LISTED_COLLEGE_COUNT = LISTED_COLLEGES.length;

/** Form value prefix distinguishing a built-in list pick from a DB code. */
export const LISTED_PREFIX = "listed:";

export function listedCollegeFromValue(value: string): ListedCollege | null {
  if (!value.startsWith(LISTED_PREFIX)) return null;
  const slug = value.slice(LISTED_PREFIX.length);
  return LISTED_COLLEGES.find((college) => college.slug === slug) ?? null;
}

export function findListedCollegeByName(name: string): ListedCollege | null {
  const target = normaliseCollegeName(name);
  return (
    LISTED_COLLEGES.find(
      (college) => normaliseCollegeName(college.name) === target,
    ) ?? null
  );
}
