"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SHIFTS, type Shift } from "@/lib/types";

/**
 * Salva la regola ricorrente (un'unica regola "standard" per la V1).
 * Riceve dal form i valori "weekday:shift" (es. "2:Mattina").
 * Sostituisce integralmente i giorni della regola.
 */
export async function saveRecurringRule(formData: FormData) {
  const { supabase } = await requireAdmin();

  const selections = formData
    .getAll("slots")
    .map(String)
    .map((raw) => {
      const [w, shift] = raw.split(":");
      return { weekday: Number(w), shift: shift as Shift };
    })
    .filter(
      (s) =>
        Number.isInteger(s.weekday) &&
        s.weekday >= 0 &&
        s.weekday <= 6 &&
        SHIFTS.includes(s.shift)
    );

  // Trova la regola esistente (la più vecchia) o creane una nuova.
  const { data: existing } = await supabase
    .from("recurring_rules")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let ruleId = existing?.id;
  if (!ruleId) {
    const { data: created, error } = await supabase
      .from("recurring_rules")
      .insert({ name: "Regola standard" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ruleId = created.id;
  }

  // Sostituzione completa dei giorni della regola.
  const { error: delErr } = await supabase
    .from("recurring_rule_days")
    .delete()
    .eq("rule_id", ruleId);
  if (delErr) throw new Error(delErr.message);

  if (selections.length > 0) {
    const rows = selections.map((s) => ({
      rule_id: ruleId,
      weekday: s.weekday,
      shift: s.shift,
    }));
    const { error: insErr } = await supabase
      .from("recurring_rule_days")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/admin/regole");
  revalidatePath("/admin/sondaggi/nuovo");
}
