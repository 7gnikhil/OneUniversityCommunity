"use client";

import { useActionState, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitVerificationAction, type FormState } from "./actions";
import type { AltProof, CollegeCodeRow } from "@/lib/profile";
import {
  imageExtension,
  parseHallTicket,
  validateImageFile,
} from "@/lib/validation";

const INITIAL_STATE: FormState = { error: null };

export interface VerificationInitial {
  name: string;
  hallTicket: string;
  branch: string;
  collegeName: string;
  collegeCode: string;
  gradYear: string;
  frontPath: string | null;
  backPath: string | null;
  altProofs: AltProof[];
}

interface UploadSlotState {
  uploading: boolean;
  error: string | null;
  previewUrl: string | null;
}

const EMPTY_SLOT: UploadSlotState = {
  uploading: false,
  error: null,
  previewUrl: null,
};

const ALT_PROOF_LABELS: Record<AltProof["kind"], string> = {
  hall_ticket: "Semester hall ticket",
  bonafide: "Bonafide certificate",
  fee_receipt: "Fee receipt",
};

// Student verification form. Images upload straight from the browser into
// the PRIVATE id-cards bucket (paths prefixed with the account id); the
// server action only receives the resulting paths and re-validates
// everything. Nothing the student does here can reject or ban them — a
// doubtful submission just waits for manual review.
export default function VerificationForm({
  accountId,
  collegeCodes,
  initial,
  submitLabel,
}: {
  accountId: string;
  collegeCodes: CollegeCodeRow[];
  initial: VerificationInitial | null;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitVerificationAction,
    INITIAL_STATE,
  );

  const [hallTicket, setHallTicket] = useState<string>(
    initial?.hallTicket ?? "",
  );
  const [collegeCode, setCollegeCode] = useState<string>(
    initial?.collegeCode ?? "",
  );
  const [collegeName, setCollegeName] = useState<string>(
    initial?.collegeName ?? "",
  );

  const [frontPath, setFrontPath] = useState<string | null>(
    initial?.frontPath ?? null,
  );
  const [backPath, setBackPath] = useState<string | null>(
    initial?.backPath ?? null,
  );
  const [frontSlot, setFrontSlot] = useState<UploadSlotState>(EMPTY_SLOT);
  const [backSlot, setBackSlot] = useState<UploadSlotState>(EMPTY_SLOT);

  const [altProofs, setAltProofs] = useState<AltProof[]>(
    initial?.altProofs ?? [],
  );
  const [altKind, setAltKind] = useState<AltProof["kind"]>("hall_ticket");
  const [altSlot, setAltSlot] = useState<UploadSlotState>(EMPTY_SLOT);

  const structure = useMemo(() => parseHallTicket(hallTicket), [hallTicket]);
  const ticketCodeKnown = structure
    ? collegeCodes.some((row) => row.code === structure.collegeCode)
    : false;

  async function uploadImage(
    file: File,
    slotName: string,
  ): Promise<{ path: string } | { error: string }> {
    const invalid = validateImageFile(file);
    if (invalid) return { error: invalid };
    const supabase = createClient();
    const path = `${accountId}/${slotName}-${Date.now()}.${imageExtension(file)}`;
    const { error } = await supabase.storage
      .from("id-cards")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      return {
        error:
          "Upload failed — check your connection and try again. Nothing was submitted.",
      };
    }
    return { path };
  }

  async function handleSlotFile(
    file: File | null,
    slotName: "id-front" | "id-back",
    setPath: (path: string) => void,
    setSlot: (slot: UploadSlotState) => void,
  ): Promise<void> {
    if (!file) return;
    const chosen: File = file;
    setSlot({ uploading: true, error: null, previewUrl: null });
    const result = await uploadImage(chosen, slotName);
    if ("error" in result) {
      setSlot({ uploading: false, error: result.error, previewUrl: null });
      return;
    }
    setPath(result.path);
    setSlot({
      uploading: false,
      error: null,
      previewUrl: URL.createObjectURL(chosen),
    });
  }

  async function handleAltFile(file: File | null): Promise<void> {
    if (!file) return;
    const chosen: File = file;
    const kind: AltProof["kind"] = altKind;
    setAltSlot({ uploading: true, error: null, previewUrl: null });
    const result = await uploadImage(chosen, `alt-${kind}`);
    if ("error" in result) {
      setAltSlot({ uploading: false, error: result.error, previewUrl: null });
      return;
    }
    const path: string = result.path;
    setAltProofs((rows) => [...rows, { kind, path }]);
    setAltSlot(EMPTY_SLOT);
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none";
  const labelClass = "flex flex-col gap-1 text-left";
  const labelTextClass = "text-xs text-neutral-400";

  function uploadBox(args: {
    title: string;
    savedPath: string | null;
    slot: UploadSlotState;
    onFile: (file: File | null) => void;
  }): React.ReactNode {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 p-4 text-left">
        <p className="text-sm font-medium">{args.title}</p>
        {args.slot.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={args.slot.previewUrl}
            alt={args.title}
            className="max-h-44 w-full rounded-xl object-cover"
          />
        ) : args.savedPath ? (
          <p className="text-xs text-emerald-400">
            Uploaded ✓ — pick a new photo below to replace it.
          </p>
        ) : (
          <p className="text-xs text-neutral-500">
            No photo yet. Use a clear photo of the original card — images
            only, up to 5 MB.
          </p>
        )}
        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-medium text-white transition hover:border-neutral-500">
          {args.slot.uploading
            ? "Uploading…"
            : args.savedPath
              ? "Replace photo"
              : "Choose photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={args.slot.uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              args.onFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {args.slot.error ? (
          <p className="text-xs text-red-400" role="alert">
            {args.slot.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="frontPath" value={frontPath ?? ""} />
      <input type="hidden" name="backPath" value={backPath ?? ""} />
      <input
        type="hidden"
        name="altProofs"
        value={JSON.stringify(altProofs)}
      />

      <fieldset
        disabled={pending}
        className="flex w-full flex-col gap-4 border-0 p-0"
      >
        {uploadBox({
          title: "ID card — front (required)",
          savedPath: frontPath,
          slot: frontSlot,
          onFile: (file) =>
            void handleSlotFile(file, "id-front", setFrontPath, setFrontSlot),
        })}
        {uploadBox({
          title: "ID card — back (optional)",
          savedPath: backPath,
          slot: backSlot,
          onFile: (file) =>
            void handleSlotFile(file, "id-back", setBackPath, setBackSlot),
        })}

        <label className={labelClass}>
          <span className={labelTextClass}>Full name (as on the ID card)</span>
          <input
            name="name"
            type="text"
            required
            defaultValue={initial?.name ?? ""}
            placeholder="e.g. A. Sample Student"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          <span className={labelTextClass}>Hall-ticket number</span>
          <input
            name="hallTicket"
            type="text"
            required
            autoCapitalize="characters"
            autoComplete="off"
            value={hallTicket}
            onChange={(event) => setHallTicket(event.target.value)}
            placeholder="e.g. 22XY101Z99"
            maxLength={12}
            className={inputClass}
          />
          {hallTicket.trim() === "" ? (
            <span className="text-[11px] text-neutral-500">
              10 characters — it starts with your joining year and college
              code.
            </span>
          ) : structure ? (
            <span className="text-[11px] text-neutral-400">
              Joining year {structure.joiningYear} · college code{" "}
              {structure.collegeCode}
              {collegeCodes.length === 0
                ? " · the official college list is still being loaded, so this goes to manual review"
                : ticketCodeKnown
                  ? " · found in the official college list"
                  : " · not in the official list yet — still fine, it goes to manual review"}
              {" "}· graduation year is usually {structure.suggestedGradYear}
            </span>
          ) : (
            <span className="text-[11px] text-amber-400">
              That doesn&apos;t look like a 10-character hall-ticket number
              yet.
            </span>
          )}
        </label>

        {collegeCodes.length > 0 ? (
          <label className={labelClass}>
            <span className={labelTextClass}>College</span>
            <select
              name="collegeCode"
              value={collegeCode}
              onChange={(event) => {
                const code = event.target.value;
                setCollegeCode(code);
                const match = collegeCodes.find((row) => row.code === code);
                if (match) setCollegeName(match.college_name);
              }}
              className={inputClass}
            >
              <option value="">My college isn&apos;t listed / not sure</option>
              {collegeCodes.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.college_name} ({row.code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="collegeCode" value="" />
        )}

        <label className={labelClass}>
          <span className={labelTextClass}>
            College name{collegeCodes.length > 0 ? " (confirm or type)" : ""}
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
          {collegeCodes.length === 0 ? (
            <span className="text-[11px] text-neutral-500">
              The official college list is still being loaded — typing your
              college name is fine; a person reviews every submission anyway.
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Branch</span>
            <input
              name="branch"
              type="text"
              required
              defaultValue={initial?.branch ?? ""}
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
              defaultValue={
                initial?.gradYear ??
                (structure ? String(structure.suggestedGradYear) : "")
              }
              placeholder="2027"
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 p-4 text-left">
          <p className="text-sm font-medium">
            Card hard to read? Add another proof
          </p>
          <p className="text-xs leading-relaxed text-neutral-500">
            A semester hall ticket, bonafide certificate or fee receipt with
            your name and hall-ticket number helps the reviewer say yes
            faster. Optional — the ID card alone is enough to submit.
          </p>
          <div className="flex gap-2">
            <select
              value={altKind}
              onChange={(event) =>
                setAltKind(event.target.value as AltProof["kind"])
              }
              className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
            >
              {(
                Object.keys(ALT_PROOF_LABELS) as Array<AltProof["kind"]>
              ).map((kind) => (
                <option key={kind} value={kind}>
                  {ALT_PROOF_LABELS[kind]}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-medium text-white transition hover:border-neutral-500">
              {altSlot.uploading ? "Uploading…" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={altSlot.uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleAltFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {altSlot.error ? (
            <p className="text-xs text-red-400" role="alert">
              {altSlot.error}
            </p>
          ) : null}
          {altProofs.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {altProofs.map((proof, index) => (
                <li
                  key={`${proof.path}-${index}`}
                  className="flex items-center justify-between rounded-xl bg-neutral-900 px-3 py-2 text-xs text-neutral-300"
                >
                  <span>{ALT_PROOF_LABELS[proof.kind]} ✓</span>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300"
                    onClick={() =>
                      setAltProofs((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={frontSlot.uploading || backSlot.uploading || altSlot.uploading}
          className="w-full rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {pending ? "Submitting…" : submitLabel}
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
