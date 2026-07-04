import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { setPollStatus, deletePoll, duplicatePoll } from "@/actions/polls";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import {
  monthYearLabel,
  formatDateTimeIt,
  formatSlotLabel,
} from "@/lib/dates";
import type { PollStatus, Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: poll } = await supabase
    .from("monthly_polls")
    .select("id, title, month, year, status, closes_at, public_token")
    .eq("id", id)
    .maybeSingle();
  if (!poll) notFound();

  const status = poll.status as PollStatus;

  const { data: slots } = await supabase
    .from("poll_slots")
    .select("id, slot_date, weekday, shift")
    .eq("poll_id", poll.id)
    .order("slot_date", { ascending: true })
    .order("shift", { ascending: true });

  const slotLabel = new Map<string, string>();
  for (const s of slots ?? []) {
    slotLabel.set(s.id, formatSlotLabel(s.slot_date, s.shift as Shift));
  }

  const { data: responses } = await supabase
    .from("poll_responses")
    .select("id, name, phone, updated_at, poll_response_slots(slot_id)")
    .eq("poll_id", poll.id)
    .order("name", { ascending: true });

  // URL pubblico assoluto del sondaggio.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const publicUrl = `${proto}://${host}/s/${poll.public_token}`;

  return (
    <div className="space-y-8">
      {/* Intestazione */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{poll.title}</h1>
          <p className="mt-1 text-slate-600">
            {monthYearLabel(poll.month, poll.year)} · chiusura{" "}
            {formatDateTimeIt(poll.closes_at)}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Stato sondaggio */}
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Stato</h2>
        <div className="flex flex-wrap gap-3">
          {status === "draft" && (
            <form action={setPollStatus}>
              <input type="hidden" name="poll_id" value={poll.id} />
              <input type="hidden" name="status" value="open" />
              <button type="submit" className="btn-primary">
                Apri sondaggio
              </button>
            </form>
          )}
          {status === "open" && (
            <form action={setPollStatus}>
              <input type="hidden" name="poll_id" value={poll.id} />
              <input type="hidden" name="status" value="closed" />
              <button type="submit" className="btn-primary">
                Chiudi sondaggio
              </button>
            </form>
          )}
          {status === "closed" && (
            <form action={setPollStatus}>
              <input type="hidden" name="poll_id" value={poll.id} />
              <input type="hidden" name="status" value="open" />
              <button type="submit" className="btn-secondary">
                Riapri sondaggio
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Link pubblico */}
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Link pubblico</h2>
        {status === "draft" ? (
          <p className="text-slate-600">
            Apri il sondaggio per renderlo accessibile dal link pubblico.
          </p>
        ) : (
          <>
            <p className="break-all rounded-lg bg-slate-100 px-4 py-3 font-mono text-base">
              {publicUrl}
            </p>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex"
            >
              Apri il link pubblico
            </a>
          </>
        )}
      </section>

      {/* Risposte */}
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Risposte ({responses?.length ?? 0})
          </h2>
          <a href={`/api/export/${poll.id}`} className="btn-secondary">
            Esporta CSV
          </a>
        </div>

        {!responses || responses.length === 0 ? (
          <p className="text-slate-600">Ancora nessuna risposta.</p>
        ) : (
          <ul className="space-y-4">
            {responses.map((r) => {
              const ids = (r.poll_response_slots ?? []).map((x) => x.slot_id);
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-lg font-semibold">{r.name}</div>
                    <div className="text-slate-600">{r.phone}</div>
                  </div>
                  <div className="mt-1 text-base text-slate-500">
                    Aggiornata il {formatDateTimeIt(r.updated_at)} ·{" "}
                    {ids.length}{" "}
                    {ids.length === 1 ? "disponibilità" : "disponibilità"}
                  </div>
                  {ids.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {ids.map((sid) => (
                        <li
                          key={sid}
                          className="rounded-full bg-green-50 px-3 py-1 text-base text-green-800 ring-1 ring-green-200"
                        >
                          {slotLabel.get(sid) ?? "Slot rimosso"}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Slot generati */}
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">
          Slot generati ({slots?.length ?? 0})
        </h2>
        {!slots || slots.length === 0 ? (
          <p className="text-slate-600">
            Nessuno slot generato per questo mese (controlla la regola).
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {slots.map((s) => (
              <li key={s.id} className="text-slate-700">
                {formatSlotLabel(s.slot_date, s.shift as Shift)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Azioni avanzate */}
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">Altre azioni</h2>
        <div className="flex flex-wrap gap-3">
          <form action={duplicatePoll}>
            <input type="hidden" name="source_id" value={poll.id} />
            <button type="submit" className="btn-secondary">
              Crea sondaggio per il mese successivo
            </button>
          </form>

          <form action={deletePoll}>
            <input type="hidden" name="poll_id" value={poll.id} />
            <ConfirmSubmit
              className="btn-danger"
              message="Eliminare definitivamente questo sondaggio e tutte le risposte collegate?"
            >
              Elimina sondaggio
            </ConfirmSubmit>
          </form>
        </div>
      </section>
    </div>
  );
}
