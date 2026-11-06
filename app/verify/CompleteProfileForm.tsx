"use client";

import { useActionState, useState } from "react";
import {
  addCollegeAction,
  completeProfileAction,
  type FormState,
} from "./actions";
import type { CollegeCodeRow } from "@/lib/profile";

const INITIAL_STATE: FormState = { error: null };

export interface CompleteProfileInitial {
  collegeCode: string;
  collegeName: string;
  branch: string;
  gradYear: string;
}

// Step 2 on /verify: self-declared study details. The student picks a
// college / university from the open registry, adds their own if it is not
// listed, or simply types it. No documents are uploaded and nothing is
// checked — saving writes the private account fields and lets them in.
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

  const [newCollegeName, setNewCollegeName] = useState<string>("");
  const [newCollegeCity, setNewCollegeCity] = useState<string>("");
  const [addingCollege, setAddingCollege] = useState<boolean>(false);
  const [addCollegeError, setAddCollegeError] = useState<string | null>(null);
  const [addCollegeMessage, setAddCollegeMessage] = useState<string | null>(
    null,
  );

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

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <fieldset
        disabled={pending}
        className="flex w-full flex-col gap-4 border-0 p-0"
      >
        <label className={labelClass}>
          <span className={labelTextClass}>College / university</span>
          <select
            name="collegeCode"
            value={collegeCode}
            onChange={(event) => {
              const code = event.target.value;
              setCollegeCode(code);
              const match = colleges.find((row) => row.code === code);
              if (match) setCollegeName(match.college_name);
            }}
            className={inputClass}
          >
            <option value="">Type it below instead</option>
            {colleges.map((row) => (
              <option key={row.code} value={row.code}>
                {row.college_name}
                {row.city ? ` — ${row.city}` : ""}
                {row.status === "pending" ? " (pending review)" : ""}
              </option>
            ))}
          </select>
        </label>

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
            onChange={(event) => setCollegeName(event.target.value)}
            placeholder="e.g. Sample Institute of Technology"
            className={inputClass}
          />
          <span className="text-[11px] text-neutral-500">
            Picking or adding your college above fills this in; typing the
            name yourself works too.
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
