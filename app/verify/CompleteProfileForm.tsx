"use client";

import { useActionState, useMemo, useState } from "react";
import {
  addCollegeAction,
  completeProfileAction,
  type FormState,
} from "./actions";
import type { CollegeCodeRow } from "@/lib/profile";
import {
  LISTED_COLLEGES,
  LISTED_COLLEGE_COUNT,
  LISTED_PREFIX,
  type ListedCollege,
} from "@/lib/colleges";
import { normaliseCollegeName } from "@/lib/validation";

const INITIAL_STATE: FormState = { error: null };

export interface CompleteProfileInitial {
  collegeCode: string;
  collegeName: string;
  branch: string;
  gradYear: string;
}

type RegionFilter = "All" | "Hyderabad" | "Telangana" | "Andhra Pradesh";

interface PickerOption {
  /** Form value submitted as collegeCode. */
  value: string;
  name: string;
  city: string | null;
  state: string | null;
  type: string | null;
  pending: boolean;
}

// Step 2 on /verify: self-declared study details. The student picks a
// college / university from the built-in Hyderabad + Telangana + Andhra
// Pradesh list (539 colleges, searchable) or the open DB registry, adds
// their own if it is not listed, or simply types it. No documents are
// uploaded and nothing is checked — saving writes the private account
// fields and lets them in.
export default function CompleteProfileForm({
  collegeCodes,
  initial,
}: {
  collegeCodes: CollegeCodeRow[];
  initial: CompleteProfileInitial;
}) {
  const [state, formAction, pending] = useActionState(
    completeProfileAction,
    INITIAL_STATE,
  );

  const [colleges, setColleges] = useState<CollegeCodeRow[]>(collegeCodes);
  const [collegeCode, setCollegeCode] = useState<string>(initial.collegeCode);
  const [collegeName, setCollegeName] = useState<string>(initial.collegeName);

  const [query, setQuery] = useState<string>("");
  const [region, setRegion] = useState<RegionFilter>("All");
  const [pickerOpen, setPickerOpen] = useState<boolean>(
    initial.collegeCode === "" && initial.collegeName === "",
  );

  const [newCollegeName, setNewCollegeName] = useState<string>("");
  const [newCollegeCity, setNewCollegeCity] = useState<string>("");
  const [addingCollege, setAddingCollege] = useState<boolean>(false);
  const [addCollegeError, setAddCollegeError] = useState<string | null>(null);
  const [addCollegeMessage, setAddCollegeMessage] = useState<string | null>(
    null,
  );

  // DB registry rows + the built-in TS/AP list, de-duplicated by
  // normalised name (a DB row wins — it carries the real registry code).
  const options = useMemo<PickerOption[]>(() => {
    const byName = new Map<string, PickerOption>();
    for (const college of LISTED_COLLEGES as ListedCollege[]) {
      byName.set(normaliseCollegeName(college.name), {
        value: `${LISTED_PREFIX}${college.slug}`,
        name: college.name,
        city: college.city,
        state: college.state,
        type: college.type,
        pending: false,
      });
    }
    for (const row of colleges) {
      byName.set(normaliseCollegeName(row.college_name), {
        value: row.code,
        name: row.college_name,
        city: row.city,
        state: null,
        type: null,
        pending: row.status === "pending",
      });
    }
    return [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [colleges]);

  const selectedOption = useMemo<PickerOption | null>(() => {
    if (!collegeCode) return null;
    return options.find((option) => option.value === collegeCode) ?? null;
  }, [options, collegeCode]);

  const results = useMemo<PickerOption[]>(() => {
    const q = normaliseCollegeName(query);
    const filtered = options.filter((option) => {
      if (region === "Hyderabad") {
        const city = (option.city ?? "").toLowerCase();
        if (city !== "hyderabad" && city !== "secunderabad") return false;
      } else if (region !== "All") {
        if (option.state && option.state !== region) return false;
        if (!option.state && region === "Andhra Pradesh") return false;
      }
      if (!q) return true;
      const haystack = normaliseCollegeName(
        `${option.name} ${option.city ?? ""}`,
      );
      return q
        .split(" ")
        .filter(Boolean)
        .every((word) => haystack.includes(word));
    });
    // With no query, surface Hyderabad first — most students start there.
    if (!q) {
      const hyd = filtered.filter((option) =>
        ["hyderabad", "secunderabad"].includes(
          (option.city ?? "").toLowerCase(),
        ),
      );
      const rest = filtered.filter(
        (option) =>
          !["hyderabad", "secunderabad"].includes(
            (option.city ?? "").toLowerCase(),
          ),
      );
      return [...hyd, ...rest];
    }
    return filtered;
  }, [options, query, region]);

  const visibleResults = results.slice(0, 80);

  function pickCollege(option: PickerOption): void {
    setCollegeCode(option.value);
    setCollegeName(option.name);
    setPickerOpen(false);
    setQuery("");
  }

  function clearSelection(): void {
    setCollegeCode("");
    setPickerOpen(true);
  }

  async function handleAddCollege(): Promise<void> {
    const nameForAction: string = newCollegeName;
    const cityForAction: string = newCollegeCity;
    if (nameForAction.trim().length < 2) {
      setAddCollegeError("Enter the college or university name first.");
      setAddCollegeMessage(null);
      return;
    }

    setAddingCollege(true);
    setAddCollegeError(null);
    setAddCollegeMessage(null);
    let result: Awaited<ReturnType<typeof addCollegeAction>>;
    try {
      result = await addCollegeAction(
        nameForAction,
        cityForAction.trim() ? cityForAction : undefined,
      );
    } catch {
      setAddingCollege(false);
      setAddCollegeError("Couldn't add that college — please try again.");
      return;
    }
    setAddingCollege(false);

    if (result.error || !result.college) {
      setAddCollegeError(
        result.error ?? "Couldn't add that college — please try again.",
      );
      return;
    }

    const college: CollegeCodeRow = result.college;
    setColleges((rows) => {
      if (rows.some((row) => row.code === college.code)) return rows;
      return [...rows, college].sort((a, b) =>
        a.college_name.localeCompare(b.college_name),
      );
    });
    setCollegeCode(college.code);
    setCollegeName(college.college_name);
    setPickerOpen(false);
    setNewCollegeName("");
    setNewCollegeCity("");
    setAddCollegeMessage(
      college.status === "pending"
        ? `${college.college_name} is added and selected. It's marked pending for registry review — you can continue now.`
        : `${college.college_name} is selected.`,
    );
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";
  const labelClass = "flex flex-col gap-1 text-left";
  const labelTextClass = "text-xs text-neutral-400";
  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "border-white bg-white text-black"
        : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
    }`;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <fieldset
        disabled={pending}
        className="flex w-full flex-col gap-4 border-0 p-0"
      >
        <input type="hidden" name="collegeCode" value={collegeCode} />

        <div className="flex flex-col gap-2 text-left">
          <span className={labelTextClass}>
            College / university — pick yours directly
          </span>
          <p className="text-[11px] leading-relaxed text-neutral-500">
            {LISTED_COLLEGE_COUNT} colleges listed across Hyderabad,
            Telangana &amp; Andhra Pradesh — universities, engineering,
            degree, pharmacy, medical and more. Search and tap yours.
          </p>

          {selectedOption && !pickerOpen ? (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-900 bg-emerald-950/40 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {selectedOption.name}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {[
                    selectedOption.city,
                    selectedOption.state,
                    selectedOption.type,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {selectedOption.pending ? " · pending review" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 text-xs font-medium text-white transition hover:border-neutral-500"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search — try CBIT, Osmania, Vijayawada, Warangal…"
                aria-label="Search colleges"
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2">
                {(
                  ["All", "Hyderabad", "Telangana", "Andhra Pradesh"] as const
                ).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRegion(value)}
                    className={chipClass(region === value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-neutral-800">
                {visibleResults.length === 0 ? (
                  <p className="p-4 text-xs leading-relaxed text-neutral-500">
                    No college matches that search. Check the spelling, try
                    the city name — or add your college below.
                  </p>
                ) : (
                  visibleResults.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => pickCollege(option)}
                      className="flex w-full flex-col gap-0.5 border-b border-neutral-900 px-4 py-3 text-left transition last:border-b-0 hover:bg-neutral-900"
                    >
                      <span className="text-sm text-white">{option.name}</span>
                      <span className="text-[11px] text-neutral-500">
                        {[option.city, option.state, option.type]
                          .filter(Boolean)
                          .join(" · ")}
                        {option.pending ? " · pending review" : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-[11px] text-neutral-500">
                Showing {visibleResults.length} of {results.length} colleges
                {results.length > visibleResults.length
                  ? " — keep typing to narrow it down."
                  : "."}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 p-4 text-left">
          <p className="text-sm font-medium">
            My college isn&apos;t listed — add it
          </p>
          <p className="text-xs leading-relaxed text-neutral-500">
            Add any college or university and use it straight away. New
            entries stay marked pending while the registry is reviewed.
          </p>
          <input
            type="text"
            aria-label="New college or university name"
            value={newCollegeName}
            onChange={(event) => setNewCollegeName(event.target.value)}
            placeholder="e.g. Sample Institute of Technology"
            className={inputClass}
          />
          <input
            type="text"
            aria-label="New college or university city (optional)"
            value={newCollegeCity}
            onChange={(event) => setNewCollegeCity(event.target.value)}
            placeholder="City (optional)"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void handleAddCollege()}
            disabled={addingCollege || newCollegeName.trim().length < 2}
            className="inline-flex items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-medium text-white transition hover:border-neutral-500 disabled:opacity-60"
          >
            {addingCollege ? "Adding…" : "Add and select my college"}
          </button>
          {addCollegeError ? (
            <p className="text-xs text-red-400" role="alert">
              {addCollegeError}
            </p>
          ) : null}
          {addCollegeMessage ? (
            <p className="text-xs text-emerald-400">{addCollegeMessage}</p>
          ) : null}
        </div>

        <label className={labelClass}>
          <span className={labelTextClass}>
            College / university name (confirm or type)
          </span>
          <input
            name="collegeName"
            type="text"
            required
            value={collegeName}
            onChange={(event) => {
              const value = event.target.value;
              setCollegeName(value);
              // Typing a different name by hand drops the list pick, so a
              // stale registry code never gets saved against a new name.
              if (
                selectedOption &&
                normaliseCollegeName(value) !==
                  normaliseCollegeName(selectedOption.name)
              ) {
                setCollegeCode("");
              }
            }}
            placeholder="e.g. Sample Institute of Technology"
            className={inputClass}
          />
          <span className="text-[11px] text-neutral-500">
            Picking your college above fills this in; typing the name
            yourself works too.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Branch</span>
            <input
              name="branch"
              type="text"
              required
              defaultValue={initial.branch}
              placeholder="e.g. CSE (AI & ML)"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Graduation year</span>
            <input
              name="gradYear"
              type="number"
              required
              min={2020}
              max={2035}
              defaultValue={initial.gradYear}
              placeholder="2027"
              className={inputClass}
            />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-neutral-500">
          These study details stay private on your account — they never
          appear on your public profile.
        </p>

        <button
          type="submit"
          disabled={addingCollege}
          className="w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save and enter OneUco"}
        </button>
      </fieldset>

      {state.error ? (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
