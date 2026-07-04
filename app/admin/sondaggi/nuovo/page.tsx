import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createPoll, duplicatePoll } from "@/actions/polls";
import { MONTH_LONG, monthYearLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function NuovoSondaggioPage() {
  const { supabase } = await requireAdmin();

  const { data: rule } = await supabase
    .from("recurring_rules")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: polls } = await supabase
    .from("monthly_polls")
    .select("id, title, month, year")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const now = new Date();
  const defMonth = now.getMonth() + 1;
  const defYear = now.getFullYear();

  if (!rule) {
    return (
      <div className="card space-y-4">
        <h1 className="text-2xl font-bold">Nuovo sondaggio</h1>
        <p className="text-slate-700">
          Prima di creare un sondaggio devi definire la regola ricorrente
          (giorni e turni).
        </p>
        <Link href="/admin/regole" className="btn-primary inline-flex">
          Vai alla regola ricorrente
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Nuovo sondaggio</h1>

      <form action={createPoll} className="card space-y-5">
        <div>
          <label className="label" htmlFor="title">
            Titolo
          </label>
          <input
            id="title"
            name="title"
            type="text"
            className="field"
            defaultValue={`Disponibilità ${monthYearLabel(defMonth, defYear)}`}
            required
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="month">
              Mese
            </label>
            <select
              id="month"
              name="month"
              className="field"
              defaultValue={defMonth}
            >
              {MONTH_LONG.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="year">
              Anno
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              className="field"
              defaultValue={defYear}
              required
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="closes_on">
            Data di chiusura
          </label>
          <input
            id="closes_on"
            name="closes_on"
            type="date"
            className="field"
            required
          />
          <p className="mt-2 text-base text-slate-500">
            Il sondaggio si chiude automaticamente a fine giornata (23:59) della
            data scelta.
          </p>
        </div>

        <button type="submit" className="btn-primary">
          Crea sondaggio e genera gli slot
        </button>
      </form>

      {polls && polls.length > 0 && (
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold">Duplica dal mese precedente</h2>
          <p className="text-slate-600">
            Crea un nuovo sondaggio per il mese successivo a quello scelto,
            riusando la stessa regola.
          </p>
          <form
            action={duplicatePoll}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="grow">
              <label className="label" htmlFor="source_id">
                Sondaggio di origine
              </label>
              <select
                id="source_id"
                name="source_id"
                className="field"
                defaultValue={polls[0].id}
              >
                {polls.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({monthYearLabel(p.month, p.year)})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              Duplica per il mese successivo
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
