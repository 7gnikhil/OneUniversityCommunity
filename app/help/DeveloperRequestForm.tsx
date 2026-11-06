"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  listMyDeveloperRequestsAction,
  submitDeveloperRequestAction,
  type DeveloperRequestRow,
  type DeveloperRequestStatus,
} from "./actions";

// Req to Developer: the in-app request form is the ONLY developer contact
// channel — addressed to "OneUCo Developer", no email anywhere. Below the
// form, the student tracks their own requests and statuses.
const STATUS_LABELS: Record<DeveloperRequestStatus, string> = {
  received: "Received",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

const STATUS_STYLES: Record<DeveloperRequestStatus, string> = {
  received: "bg-neutral-800 text-neutral-300",
  planned: "bg-sky-500/20 text-sky-300",
  done: "bg-emerald-500/20 text-emerald-300",
  declined: "bg-red-500/20 text-red-300",
};

const CATEGORY_LABELS: Record<DeveloperRequestRow["category"], string> = {
  change: "Request a change",
  addon: "Request an add-on",
  bug: "Report a bug",
  other: "Other",
};

export default function DeveloperRequestForm({
  initialRequests,
  accentHex: accent,
}: {
  initialRequests: DeveloperRequestRow[];
  accentHex: string;
}) {
  const [requests, setRequests] = useState<DeveloperRequestRow[]>(initialRequests);
  const [category, setCategory] = useState<string>("change");
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(false);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSent(false);
    const result = await submitDeveloperRequestAction(category, title, body);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTitle("");
    setBody("");
    setSent(true);
    const fresh = await listMyDeveloperRequestsAction();
    setRequests(fresh);
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
      >
        <div>
          <p className="text-sm font-medium">Req to Developer</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            Send it straight to the OneUCo Developer. Status updates land in
            your Inbox.
          </p>
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white focus:border-neutral-500 focus:outline-none"
        >
          <option value="change">Request a change</option>
          <option value="addon">Request an add-on</option>
          <option value="bug">Report a bug</option>
          <option value="other">Other</option>
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Short title"
          maxLength={120}
          required
          className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Describe it — what happened, or what you'd love to see…"
          maxLength={2000}
          rows={4}
          required
          className="w-full resize-none rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {sent ? <p className="text-sm text-emerald-400">Sent ✓ — it&apos;s with the developer.</p> : null}
        <button
          type="submit"
          disabled={busy || !title.trim() || !body.trim()}
          className="w-full rounded-full px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: accent }}
        >
          {busy ? "Sending…" : "Send request"}
        </button>
      </form>

      {requests.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Your requests
          </h3>
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-col gap-1 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{request.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[request.status]}`}
                >
                  {STATUS_LABELS[request.status]}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {CATEGORY_LABELS[request.category]} ·{" "}
                {new Date(request.created_at).toLocaleDateString([], {
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <p className="text-sm leading-relaxed text-neutral-400">{request.body}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
