"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateProfileAction, type ProfileFormState } from "./actions";
import {
  INTENTIONS,
  normalisePortfolio,
  type AllPreferences,
  type Portfolio,
} from "@/lib/preferences";
import { ACCENT_COLORS, LANGUAGES, accentHex, imageExtension, validateImageFile } from "@/lib/validation";
import type { Intention } from "@/lib/types";
import PrivacySettings from "./PrivacySettings";

const INITIAL_STATE: ProfileFormState = { error: null, saved: false };
const MAX_GALLERY = 6;

export interface ProfileEditorInitial {
  accountId: string;
  username: string;
  oneucoId: string;
  name: string;
  bio: string;
  branch: string;
  photoUrl: string | null;
  photoUrls: string[];
  portfolio: Portfolio;
  intention: Intention | null;
  preferences: AllPreferences;
  accentColor: string;
  showOnline: boolean;
  readReceipts: boolean;
}

// Profile + settings editor. Photos upload from the browser straight into
// the PUBLIC avatars bucket under the account's own folder; everything
// else saves through the server action (session client + RLS). Only
// public fields live here — the private college/graduation-year declarations never appear.
export default function ProfileEditor({
  initial,
}: {
  initial: ProfileEditorInitial;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    INITIAL_STATE,
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl);
  const [gallery, setGallery] = useState<string[]>(initial.photoUrls);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [portfolio, setPortfolio] = useState<Portfolio>(initial.portfolio);
  const [intention, setIntention] = useState<Intention | "">(
    initial.intention ?? "",
  );
  const [prefs, setPrefs] = useState<AllPreferences>(initial.preferences);
  const [accent, setAccent] = useState<string>(initial.accentColor);
  const accentColorHex = accentHex(accent);

  async function uploadAvatar(
    file: File,
    slot: string,
  ): Promise<{ url: string } | { error: string }> {
    const invalid = validateImageFile(file);
    if (invalid) return { error: invalid };
    const supabase = createClient();
    const path = `${initial.accountId}/${slot}-${Date.now()}.${imageExtension(file)}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      return { error: "Upload failed — check your connection and try again." };
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return { url: data.publicUrl };
  }

  async function handleDp(file: File | null): Promise<void> {
    if (!file) return;
    const chosen: File = file;
    setUploading(true);
    setUploadError(null);
    const result = await uploadAvatar(chosen, "dp");
    setUploading(false);
    if ("error" in result) {
      setUploadError(result.error);
      return;
    }
    setPhotoUrl(result.url);
  }

  async function handleGalleryAdd(file: File | null): Promise<void> {
    if (!file) return;
    const chosen: File = file;
    if (gallery.length >= MAX_GALLERY) {
      setUploadError(`Gallery is full — up to ${MAX_GALLERY} photos.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    const result = await uploadAvatar(chosen, "gallery");
    setUploading(false);
    if ("error" in result) {
      setUploadError(result.error);
      return;
    }
    const url: string = result.url;
    setGallery((rows) => [...rows, url].slice(0, MAX_GALLERY));
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";
  const labelClass = "flex flex-col gap-1 text-left";
  const labelTextClass = "text-xs text-neutral-400";

  function languageChips(
    selected: string[],
    onChange: (languages: string[]) => void,
  ): React.ReactNode {
    return (
      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.map((language) => {
          const active = selected.includes(language);
          return (
            <button
              key={language}
              type="button"
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((row) => row !== language)
                    : [...selected, language],
                )
              }
              className="rounded-full border px-3 py-1.5 text-xs transition"
              style={
                active
                  ? { borderColor: accentColorHex, color: "#fff", backgroundColor: `${accentColorHex}33` }
                  : { borderColor: "#262626", color: "#a3a3a3" }
              }
            >
              {language}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <form action={formAction} className="flex w-full flex-col gap-6">
        <input type="hidden" name="photoUrl" value={photoUrl ?? ""} />
        <input type="hidden" name="photoUrls" value={JSON.stringify(gallery)} />
        <input
          type="hidden"
          name="portfolio"
          value={JSON.stringify(normalisePortfolio(portfolio))}
        />
        <input
          type="hidden"
          name="preferences"
          value={JSON.stringify(prefs)}
        />
        <input type="hidden" name="intention" value={intention} />
        <input type="hidden" name="accentColor" value={accent} />

        {/* Header */}
        <header className="flex flex-col items-center gap-3 text-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Your profile photo"
              className="h-24 w-24 rounded-full object-cover"
              style={{
                boxShadow:
                  "0 0 0 2px var(--metal-ring, #8a6414), 0 0 18px color-mix(in srgb, var(--metal-accent, #d4af37) 35%, transparent)",
              }}
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-900 text-2xl font-semibold text-neutral-500"
              style={{
                boxShadow:
                  "0 0 0 2px var(--metal-ring, #8a6414), 0 0 18px color-mix(in srgb, var(--metal-accent, #d4af37) 35%, transparent)",
              }}
            >
              {(initial.name || initial.username || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">
              {initial.name || "Your profile"}
            </h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              @{initial.username} · OneUco ID {initial.oneucoId}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-medium transition hover:border-neutral-500">
            {uploading ? "Uploading…" : photoUrl ? "Replace DP" : "Add a DP"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleDp(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-[11px] text-neutral-500">
            Your DP, photos, name, bio and branch are what other students
            see. The college and graduation year you declared when joining
            stay private.
          </p>
        </header>

        {/* Gallery */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Photos</h2>
          {gallery.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((url, index) => (
                <div key={`${url}-${index}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Gallery photo ${index + 1}`}
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs text-red-300"
                    onClick={() =>
                      setGallery((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              No gallery photos yet — up to {MAX_GALLERY}, all optional.
            </p>
          )}
          {gallery.length < MAX_GALLERY ? (
            <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-medium transition hover:border-neutral-500">
              {uploading ? "Uploading…" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleGalleryAdd(file);
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
          {uploadError ? (
            <p className="text-xs text-red-400" role="alert">
              {uploadError}
            </p>
          ) : null}
        </section>

        {/* About */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">About</h2>
          <label className={labelClass}>
            <span className={labelTextClass}>Name</span>
            <input
              name="name"
              type="text"
              defaultValue={initial.name}
              placeholder="Your name"
              maxLength={80}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Bio</span>
            <textarea
              name="bio"
              defaultValue={initial.bio}
              placeholder="A line or two about you — optional"
              maxLength={300}
              rows={3}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Branch</span>
            <input
              name="branch"
              type="text"
              defaultValue={initial.branch}
              placeholder="e.g. CSE (AI & ML)"
              maxLength={80}
              className={inputClass}
            />
          </label>
        </section>

        {/* Portfolio */}
        <section id="portfolio" className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium">Portfolio</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Links you want on your profile — added here, never asked for at
              sign-up.
            </p>
          </div>
          {(
            [
              ["github", "GitHub", "https://github.com/you"],
              ["linkedin", "LinkedIn", "https://linkedin.com/in/you"],
              ["website", "Website", "https://your-site.example"],
              ["other", "Other link", "https://…"],
            ] as Array<[keyof Portfolio, string, string]>
          ).map(([key, label, placeholder]) => (
            <label key={key} className={labelClass}>
              <span className={labelTextClass}>{label}</span>
              <input
                type="url"
                value={portfolio[key]}
                placeholder={placeholder}
                onChange={(event) =>
                  setPortfolio((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
          ))}
        </section>

        {/* Intention + preferences */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium">Intention & preferences</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              What you&apos;re here for, and who the deck should show you.
              Everything defaults to Any — set only what you care about.
            </p>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>I&apos;m here for</span>
            <select
              value={intention}
              onChange={(event) =>
                setIntention(event.target.value as Intention | "")
              }
              className={inputClass}
            >
              <option value="">Not set yet</option>
              {INTENTIONS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>

          {intention === "dating" ? (
            <div className="flex flex-col gap-3">
              <label className={labelClass}>
                <span className={labelTextClass}>Interested in</span>
                <select
                  value={prefs.dating.interestedIn}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      dating: {
                        ...current.dating,
                        interestedIn: event.target.value as AllPreferences["dating"]["interestedIn"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="girls">Girls</option>
                  <option value="boys">Boys</option>
                  <option value="everyone">Everyone</option>
                </select>
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Year</span>
                <select
                  value={prefs.dating.yearPref}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      dating: {
                        ...current.dating,
                        yearPref: event.target.value as AllPreferences["dating"]["yearPref"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="seniors">Seniors</option>
                  <option value="juniors">Juniors</option>
                  <option value="same">Same year</option>
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className={labelTextClass}>Languages</span>
                {languageChips(prefs.dating.languages, (languages) =>
                  setPrefs((current) => ({
                    ...current,
                    dating: { ...current.dating, languages },
                  })),
                )}
              </div>
              <label className={labelClass}>
                <span className={labelTextClass}>College preference</span>
                <input
                  type="text"
                  value={prefs.dating.college}
                  placeholder="Any college — or type one"
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      dating: { ...current.dating, college: event.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  <span className={labelTextClass}>Age from</span>
                  <input
                    type="number"
                    min={16}
                    max={60}
                    value={prefs.dating.ageMin ?? ""}
                    placeholder="Any"
                    onChange={(event) =>
                      setPrefs((current) => ({
                        ...current,
                        dating: {
                          ...current.dating,
                          ageMin:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Age to</span>
                  <input
                    type="number"
                    min={16}
                    max={60}
                    value={prefs.dating.ageMax ?? ""}
                    placeholder="Any"
                    onChange={(event) =>
                      setPrefs((current) => ({
                        ...current,
                        dating: {
                          ...current.dating,
                          ageMax:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        },
                      }))
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {intention === "friendship" ? (
            <div className="flex flex-col gap-3">
              <label className={labelClass}>
                <span className={labelTextClass}>College</span>
                <select
                  value={prefs.friendship.collegePref}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      friendship: {
                        ...current.friendship,
                        collegePref: event.target.value as AllPreferences["friendship"]["collegePref"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="same_college">My college</option>
                  <option value="any_college">Other colleges too</option>
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className={labelTextClass}>Languages</span>
                {languageChips(prefs.friendship.languages, (languages) =>
                  setPrefs((current) => ({
                    ...current,
                    friendship: { ...current.friendship, languages },
                  })),
                )}
              </div>
            </div>
          ) : null}

          {intention === "study_partner" ? (
            <div className="flex flex-col gap-3">
              <label className={labelClass}>
                <span className={labelTextClass}>Branch</span>
                <select
                  value={prefs.study_partner.branchPref}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      study_partner: {
                        ...current.study_partner,
                        branchPref: event.target.value as AllPreferences["study_partner"]["branchPref"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="same_branch">My branch</option>
                  <option value="any_branch">Other branches too</option>
                </select>
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>College</span>
                <select
                  value={prefs.study_partner.collegePref}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      study_partner: {
                        ...current.study_partner,
                        collegePref: event.target.value as AllPreferences["study_partner"]["collegePref"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="same_college">My college</option>
                  <option value="any_college">Other colleges too</option>
                </select>
              </label>
            </div>
          ) : null}

          {intention === "networking" ? (
            <div className="flex flex-col gap-3">
              <label className={labelClass}>
                <span className={labelTextClass}>Focus</span>
                <select
                  value={prefs.networking.focus}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      networking: {
                        ...current.networking,
                        focus: event.target.value as AllPreferences["networking"]["focus"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="placements">Placements</option>
                  <option value="projects">Projects</option>
                  <option value="startups">Startups</option>
                  <option value="research">Research</option>
                </select>
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>College</span>
                <select
                  value={prefs.networking.collegePref}
                  onChange={(event) =>
                    setPrefs((current) => ({
                      ...current,
                      networking: {
                        ...current.networking,
                        collegePref: event.target.value as AllPreferences["networking"]["collegePref"],
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="any">Any</option>
                  <option value="same_college">My college</option>
                  <option value="any_college">Other colleges too</option>
                </select>
              </label>
            </div>
          ) : null}
        </section>

        {/* App colour */}
        <section id="app-colour" className="flex flex-col gap-2">
          <div>
            <h2 className="text-sm font-medium">App colour</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Your accent across OneUco. Black is the default.
              {/* TODO (later slice): apply the accent app-wide (dial,
                  buttons, badges) via a layout-level theme read. */}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((row) => {
              const active = accent === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setAccent(row.id)}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition"
                  style={
                    active
                      ? { borderColor: row.hex, color: "#fff" }
                      : { borderColor: "#262626", color: "#a3a3a3" }
                  }
                >
                  <span
                    className="h-3 w-3 rounded-full border border-white/20"
                    style={{ backgroundColor: row.hex }}
                  />
                  {row.label}
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="submit"
          disabled={pending || uploading}
          className="w-full rounded-full px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60"
          style={{ backgroundColor: accentColorHex }}
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.error ? (
          <p className="text-sm text-red-400" role="alert">
            {state.error}
          </p>
        ) : state.saved ? (
          <p className="text-sm text-emerald-400">Saved ✓</p>
        ) : null}
      </form>

      {/* Privacy — its own component: the toggles save immediately
          through updatePrivacyAction, outside this form's Save. */}
      <PrivacySettings
        initialShowOnline={initial.showOnline}
        initialReadReceipts={initial.readReceipts}
        accentHex={accentColorHex}
      />

      {/* Shortcuts & account. The Help / Req to Developer links that
          used to sit here are GONE: FAQs and the developer-request form
          now live as their own sections (About & FAQs, Queries) on this
          very page — one home per thing, nothing listed twice. */}
      <section className="flex w-full flex-col gap-1 border-t border-neutral-900 pt-5">
        <h2 className="mb-1 text-sm font-medium">Shortcuts &amp; account</h2>
        <a
          href="#portfolio"
          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-900"
        >
          Portfolio <span className="text-neutral-500">Edit links ↑</span>
        </a>
        <a
          href="#app-colour"
          className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-900"
        >
          App colour{" "}
          <span className="flex items-center gap-1.5 text-neutral-500">
            <span
              className="h-3 w-3 rounded-full border border-white/20"
              style={{ backgroundColor: accentColorHex }}
            />
            {ACCENT_COLORS.find((row) => row.id === accent)?.label ?? "Black"}
          </span>
        </a>
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-neutral-200">
          Account
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="font-medium text-red-400 transition hover:text-red-300"
            >
              Log out
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
