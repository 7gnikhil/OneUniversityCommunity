"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { imageExtension, validateImageFile } from "@/lib/validation";
import { createServerAction, joinByInviteCodeAction } from "./actions";

// Create-a-server form + join-by-code box for the Servers list page.
// The icon uploads from the browser into the public server-images bucket
// under my own account folder (owner-folder storage policy), and only its
// public URL is handed to the create action.
export default function CreateServerForm({ myAccountId }: { myAccountId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<"public" | "friends_private" | "strangers_private">("public");
  const [description, setDescription] = useState<string>("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string>("");
  const [codeBusy, setCodeBusy] = useState<boolean>(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    let iconUrl: string | null = null;
    if (iconFile) {
      const chosen: File = iconFile;
      const invalid = validateImageFile(chosen);
      if (invalid) {
        setBusy(false);
        setError(invalid);
        return;
      }
      const supabase = createClient();
      const path = `${myAccountId}/server-icon-${Date.now()}.${imageExtension(chosen)}`;
      const { error: uploadError } = await supabase.storage
        .from("server-images")
        .upload(path, chosen, { contentType: chosen.type, upsert: false });
      if (uploadError) {
        setBusy(false);
        setError("Icon upload failed — try again, or skip the icon.");
        return;
      }
      iconUrl = supabase.storage.from("server-images").getPublicUrl(path).data.publicUrl;
    }

    const result = await createServerAction({
      name,
      type,
      description,
      iconUrl,
    });
    setBusy(false);
    if (result.error || !result.serverId) {
      setError(result.error ?? "Couldn't create the server.");
      return;
    }
    router.push(`/servers/${result.serverId}`);
  }

  async function onJoinByCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (codeBusy || !code.trim()) return;
    setCodeBusy(true);
    setCodeError(null);
    const result = await joinByInviteCodeAction(code);
    setCodeBusy(false);
    if (result.error || !result.serverId) {
      setCodeError(result.error ?? "That code didn't work.");
      return;
    }
    router.push(`/servers/${result.serverId}`);
  }

  return (
    <section className="flex flex-col gap-3">
      <form
        onSubmit={(event) => void onJoinByCode(event)}
        className="flex items-center gap-2"
      >
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Invite code"
          maxLength={16}
          className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm uppercase text-white placeholder:normal-case placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={codeBusy || !code.trim()}
          className="shrink-0 rounded-full border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-40"
        >
          {codeBusy ? "…" : "Join"}
        </button>
      </form>
      {codeError ? (
        <p className="text-sm text-red-400" role="alert">
          {codeError}
        </p>
      ) : null}

      {open ? (
        <form
          onSubmit={(event) => void onCreate(event)}
          className="metal-frame flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-950 p-4"
        >
          <p className="text-sm font-medium">Create a server</p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Server name"
            maxLength={60}
            required
            className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "public" | "friends_private" | "strangers_private")
            }
            className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white focus:border-neutral-500 focus:outline-none"
          >
            <option value="public">Public — any student can find and join</option>
            <option value="friends_private">Private among friends — invite only</option>
            <option value="strangers_private">Private among strangers — invite only</option>
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What's it about? (optional)"
            maxLength={300}
            rows={2}
            className="w-full resize-none rounded-xl border border-neutral-800 bg-black px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <input
              ref={iconInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => setIconFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => iconInputRef.current?.click()}
              className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300 transition hover:bg-neutral-900"
            >
              {iconFile ? `Icon: ${iconFile.name}` : "Add an icon (optional)"}
            </button>
            {iconFile ? (
              <button
                type="button"
                onClick={() => setIconFile(null)}
                className="text-xs text-neutral-500 transition hover:text-white"
              >
                Remove
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create server"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-neutral-900"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-full border border-dashed border-neutral-700 px-4 py-3 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
        >
          + Create a server
        </button>
      )}
    </section>
  );
}
