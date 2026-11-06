import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin-page";
import { REQ_TO_ADMIN_FLAIR, type FlairRow } from "@/lib/servers";
import {
  CreateFlairForm,
  FlairColorEditor,
  FlairDeleteButton,
} from "../AdminQueueBits";

// Flair manager: full CRUD over global and per-server flairs. The
// built-in global ReqToAdmin flair is protected — recolour it here, but
// its name and existence are load-bearing for the ReqToAdmin queue.
export default async function AdminFlairsPage() {
  const { admin } = await requireAdminPage();

  const [flairsResult, serversResult] = await Promise.all([
    admin
      .from("flairs")
      .select("id, server_id, name, color")
      .order("name", { ascending: true }),
    admin.from("servers").select("id, name").order("name", { ascending: true }),
  ]);
  const flairs = (flairsResult.data ?? []) as FlairRow[];
  const servers = (serversResult.data ?? []) as Array<{ id: string; name: string }>;
  const serverNames = new Map<string, string>();
  servers.forEach((server) => serverNames.set(server.id, server.name));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm text-neutral-400 transition hover:text-white">
          ← Admin
        </Link>
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          OneUCo Developer
        </p>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">Flair manager</h1>

      <CreateFlairForm servers={servers} />

      <section className="flex flex-col gap-2">
        {flairs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No flairs yet — migration-0004 seeds the built-in ReqToAdmin
            flair once an owner account exists.
          </p>
        ) : (
          flairs.map((flair) => {
            const builtIn =
              flair.server_id === null && flair.name === REQ_TO_ADMIN_FLAIR;
            return (
              <article
                key={flair.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: flair.color }}
                >
                  {flair.name}
                </span>
                <span className="text-xs text-neutral-500">
                  {flair.server_id === null
                    ? "Global"
                    : (serverNames.get(flair.server_id) ?? "A server")}
                  {builtIn ? " · built-in" : ""}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <FlairColorEditor flairId={flair.id} color={flair.color} />
                  {builtIn ? null : <FlairDeleteButton flairId={flair.id} />}
                </span>
              </article>
            );
          })
        )}
      </section>

      <p className="text-xs leading-relaxed text-neutral-600">
        Assigning flairs to messages happens inside each server (staff
        controls on a message). Deleting a flair first clears it from any
        messages carrying it.
      </p>
    </main>
  );
}
