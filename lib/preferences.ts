// Intention + preference shapes stored in profiles.preferences (jsonb),
// keyed by intention. Every field defaults to "Any" — preferences only
// ever narrow the deck when the student sets them. Pure module: shared by
// the profile editor (client) and the profile server action, which
// re-validates everything through normalisePreferences before writing.

import type { Intention } from "@/lib/types";
import { normaliseUrl } from "@/lib/urls";

export interface DatingPreferences {
  interestedIn: "any" | "girls" | "boys" | "everyone";
  yearPref: "any" | "seniors" | "juniors" | "same";
  languages: string[];
  college: string;
  ageMin: number | null;
  ageMax: number | null;
}

export interface FriendshipPreferences {
  collegePref: "any" | "same_college" | "any_college";
  languages: string[];
}

export interface StudyPartnerPreferences {
  branchPref: "any" | "same_branch" | "any_branch";
  collegePref: "any" | "same_college" | "any_college";
}

export interface NetworkingPreferences {
  focus: "any" | "placements" | "projects" | "startups" | "research";
  collegePref: "any" | "same_college" | "any_college";
}

export interface AllPreferences {
  dating: DatingPreferences;
  friendship: FriendshipPreferences;
  study_partner: StudyPartnerPreferences;
  networking: NetworkingPreferences;
}

export const DEFAULT_PREFERENCES: AllPreferences = {
  dating: {
    interestedIn: "any",
    yearPref: "any",
    languages: [],
    college: "",
    ageMin: null,
    ageMax: null,
  },
  friendship: { collegePref: "any", languages: [] },
  study_partner: { branchPref: "any", collegePref: "any" },
  networking: { focus: "any", collegePref: "any" },
};

export const INTENTIONS: Array<{ id: Intention; label: string }> = [
  { id: "dating", label: "Dating" },
  { id: "friendship", label: "Friendship" },
  { id: "study_partner", label: "Study partner" },
  { id: "networking", label: "Networking" },
];

export const PORTFOLIO_KEYS = ["github", "linkedin", "website", "other"] as const;
export type PortfolioKey = (typeof PORTFOLIO_KEYS)[number];
export type Portfolio = Record<PortfolioKey, string>;

export const EMPTY_PORTFOLIO: Portfolio = {
  github: "",
  linkedin: "",
  website: "",
  other: "",
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  return typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)
    ? (value as T)
    : fallback;
}

function pickLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is string => typeof row === "string").slice(0, 10);
}

function pickAge(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 16 && value <= 60
    ? value
    : null;
}

function pickText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Defensive parse of whatever jsonb came back / was submitted — unknown or
// legacy shapes degrade to the "Any" defaults rather than breaking.
export function normalisePreferences(raw: unknown): AllPreferences {
  const root = asRecord(raw);
  const dating = asRecord(root.dating);
  const friendship = asRecord(root.friendship);
  const study = asRecord(root.study_partner);
  const networking = asRecord(root.networking);
  return {
    dating: {
      interestedIn: pickEnum(dating.interestedIn, ["any", "girls", "boys", "everyone"], "any"),
      yearPref: pickEnum(dating.yearPref, ["any", "seniors", "juniors", "same"], "any"),
      languages: pickLanguages(dating.languages),
      college: pickText(dating.college, 120),
      ageMin: pickAge(dating.ageMin),
      ageMax: pickAge(dating.ageMax),
    },
    friendship: {
      collegePref: pickEnum(friendship.collegePref, ["any", "same_college", "any_college"], "any"),
      languages: pickLanguages(friendship.languages),
    },
    study_partner: {
      branchPref: pickEnum(study.branchPref, ["any", "same_branch", "any_branch"], "any"),
      collegePref: pickEnum(study.collegePref, ["any", "same_college", "any_college"], "any"),
    },
    networking: {
      focus: pickEnum(networking.focus, ["any", "placements", "projects", "startups", "research"], "any"),
      collegePref: pickEnum(networking.collegePref, ["any", "same_college", "any_college"], "any"),
    },
  };
}

export function normalisePortfolio(raw: unknown): Portfolio {
  const root = asRecord(raw);
  // Portfolio entries are links first and text second: every value runs
  // through normaliseUrl so a pasted "github.com/me" is stored (and
  // rendered) as "https://github.com/me" instead of a dead relative
  // href. This function is the single choke point — the editor's save
  // payload, the profile server action and the public profile page all
  // normalise through here.
  return {
    github: normaliseUrl(pickText(root.github, 300)),
    linkedin: normaliseUrl(pickText(root.linkedin, 300)),
    website: normaliseUrl(pickText(root.website, 300)),
    other: normaliseUrl(pickText(root.other, 300)),
  };
}
