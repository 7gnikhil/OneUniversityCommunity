"use client";

import { useState, type ReactNode } from "react";
import {
  approveCollegeAction,
  createFlairAction,
  deleteFlairAction,
  deleteJwalamMessageAction,
  rejectCollegeAction,
  setDeveloperRequestStatusAction,
  setReportStatusAction,
  updateFlairColorAction,
} from "./actions";

// Client islands for the admin queue pages: every control calls the
// re-checking server actions in app/admin/actions.ts and surfaces errors
// inline. (Server actions revalidate the page path, so lists refresh.)

function useBusy(): [boolean, (fn: () => Promise<{ error: string | null }>) => Promise<string | null>] {
  const [busy, setBusy] = useState<boolean>(false);
  async function run(
    fn: () => Promise<{ error: string | null }>,
  ): Promise<string | null> {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    return result.error;
  }
  return [busy, run];
}

export function ActionButton({
  label,
  action,
  danger,
}: {
  label: string;
  action: () => Promise<{ error: string | null }>;
  danger?: boolean;
}) {
  const [busy, run] = useBusy();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void (async (): Promise<void> => {
            setError(await run(action));
          })();
        }}
        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          danger
            ? "border border-red-900 text-red-400 hover:bg-red-950/40"
            : "bg-white text-black hover:bg-neutral-200"
        }`}
      >
        {busy ? "…" : label}
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

export function CollegeReviewButtons({ code }: { code: string }) {
  return (
    <span className="flex gap-2">
      <ActionButton label="Approve" action={() => approveCollegeAction(code)} />
      <ActionButton label="Reject (remove)" danger action={() => rejectCollegeAction(code)} />
    </span>
  );
}

export function ReportButtons({ reportId }: { reportId: string }) {
  return (
    <span className="flex gap-2">
      <ActionButton
        label="Mark actioned"
        action={() => setReportStatusAction(reportId, "actioned")}
      />
      <ActionButton
        label="Dismiss"
        danger
        action={() => setReportStatusAction(reportId, "dismissed")}
      />
    </span>
  );
}

export function JwalamFlagButtons({ messageId }: { messageId: string }) {
  return (
    <ActionButton
      label="Delete message"
      danger
      action={() => deleteJwalamMessageAction(messageId)}
    />
  );
}

export function DevRequestStatusSelect({
  requestId,
  current,
}: {
  requestId: string;
  current: string;
}) {
  const [, run] = useBusy();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <select
        defaultValue={current}
        onChange={(event) => {
          const value: string = event.target.value;
          void (async (): Promise<void> => {
            setError(await run(() => setDeveloperRequestStatusAction(requestId, value)));
          })();
        }}
        className="rounded-full border border-neutral-700 bg-black px-3 py-1.5 text-xs text-neutral-200 focus:outline-none"
        aria-label="Set status"
      >
        <option value="received">Received</option>
        <option value="planned">Planned</option>
        <option value="done">Done</option>
        <option value="declined">Declined</option>
      </select>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

export function FlairColorEditor({
  flairId,
  color,
}: {
  flairId: string;
  color: string;
}) {
  const [busy, run] = useBusy();
  const [value, setValue] = useState<string>(color);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-black"
        aria-label="Flair colour"
      />
      <button
        type="button"
        disabled={busy || value === color}
        onClick={() => {
          void (async (): Promise<void> => {
            setError(await run(() => updateFlairColorAction(flairId, value)));
          })();
        }}
        className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-40"
      >
        {busy ? "…" : "Save colour"}
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </span>
  );
}

export function FlairDeleteButton({ flairId }: { flairId: string }) {
  return <ActionButton label="Delete" danger action={() => deleteFlairAction(flairId)} />;
}

export function CreateFlairForm({
  servers,
}: {
  servers: Array<{ id: string; name: string }>;
}) {
  const [busy, run] = useBusy();
  const [name, setName] = useState<string>("");
  const [color, setColor] = useState<string>("#888888");
  const [serverId, setServerId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  async function onCreate(): Promise<void> {
    const failure = await run(() =>
      createFlairAction(serverId === "" ? null : serverId, name, color),
    );
    setError(failure);
    if (!failure) {
      setDone(true);
      setName("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <p className="text-sm font-medium">New flair</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Flair name"
          maxLength={40}
          className="min-w-36 flex-1 rounded-xl border border-neutral-800 bg-black px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-neutral-700 bg-black"
          aria-label="Flair colour"
        />
        <select
          value={serverId}
          onChange={(event) => setServerId(event.target.value)}
          className="rounded-xl border border-neutral-800 bg-black px-3 py-2 text-sm text-white focus:border-neutral-500 focus:outline-none"
          aria-label="Scope"
        >
          <option value="">Global (all teas)</option>
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void onCreate()}
          className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-40"
        >
          {busy ? "…" : "Create"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : done ? (
        <p className="text-xs text-emerald-400">Flair created — the list above refreshes.</p>
      ) : null}
    </div>
  );
}

export function QueueShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </>
  );
}
