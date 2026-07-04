import { requireAdmin } from "@/lib/auth";
import { saveRecurringRule } from "@/actions/rules";
import { SHIFTS } from "@/lib/types";
import { WEEKDAY_LONG } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Ordine di visualizzazione: da lunedì a domenica.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default async function RegolePage() {
  const { supabase } = await requireAdmin();

  const { data: rule } = await supabase
    .from("recurring_rules")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let selected = new Set<string>();
  if (rule) {
    const { data: days } = await supabase
      .from("recurring_rule_days")
      .select("weekday, shift")
      .eq("rule_id", rule.id);
    selected = new Set((days ?? []).map((d) => `${d.weekday}:${d.shift}`));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Regola ricorrente</h1>
        <p className="mt-2 text-slate-600">
          Scegli, per ogni giorno della settimana, i turni da proporre. Questa
          regola viene usata per generare gli slot quando crei un nuovo sondaggio.
        </p>
      </div>

      <form action={saveRecurringRule} className="space-y-4">
        <div className="space-y-3">
          {DISPLAY_ORDER.map((weekday) => (
            <div key={weekday} className="card">
              <div className="mb-3 text-xl font-semibold">
                {WEEKDAY_LONG[weekday]}
              </div>
              <div className="flex flex-wrap gap-3">
                {SHIFTS.map((shift) => {
                  const value = `${weekday}:${shift}`;
                  return (
                    <label
                      key={shift}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-slate-200 px-4 py-3 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        name="slots"
                        value={value}
                        defaultChecked={selected.has(value)}
                        className="h-6 w-6"
                      />
                      <span className="text-lg">{shift}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button type="submit" className="btn-primary">
          Salva regola
        </button>
      </form>
    </div>
  );
}
