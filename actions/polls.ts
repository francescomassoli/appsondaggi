"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  generateSlots,
  monthYearLabel,
  dateEndOfDayToISO,
  zonedWallTimeToISO,
  lastDayOfMonth,
} from "@/lib/dates";
import type { Shift } from "@/lib/types";

/** Inserisce in poll_slots gli slot generati dalla regola per quel mese. */
async function generateAndInsertSlots(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  pollId: string,
  ruleId: string,
  year: number,
  month: number
) {
  const { data: ruleDays, error } = await supabase
    .from("recurring_rule_days")
    .select("weekday, shift")
    .eq("rule_id", ruleId);
  if (error) throw new Error(error.message);

  const slots = generateSlots(
    year,
    month,
    (ruleDays ?? []) as { weekday: number; shift: Shift }[]
  );
  if (slots.length === 0) return;

  const rows = slots.map((s) => ({
    poll_id: pollId,
    slot_date: s.slot_date,
    weekday: s.weekday,
    shift: s.shift,
  }));
  const { error: insErr } = await supabase.from("poll_slots").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

/** Restituisce l'id della regola da usare (quella indicata o la più vecchia). */
async function resolveRuleId(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  preferredRuleId?: string | null
): Promise<string> {
  if (preferredRuleId) return preferredRuleId;
  const { data: rule } = await supabase
    .from("recurring_rules")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!rule) {
    throw new Error(
      "Nessuna regola ricorrente definita. Crea prima la regola in /admin/regole."
    );
  }
  return rule.id;
}

/**
 * Crea un nuovo sondaggio mensile (stato 'draft') e genera gli slot del mese.
 * Campi attesi dal form: title, month, year, closes_on (date), rule_id?
 */
export async function createPoll(formData: FormData) {
  const { supabase } = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const month = Number(formData.get("month"));
  const year = Number(formData.get("year"));
  const closesOnRaw = String(formData.get("closes_on") ?? "");
  const ruleIdField = String(formData.get("rule_id") ?? "").trim();

  if (!title) throw new Error("Il titolo è obbligatorio.");
  if (!(month >= 1 && month <= 12)) throw new Error("Mese non valido.");
  if (!(year >= 2000 && year <= 2100)) throw new Error("Anno non valido.");
  if (!closesOnRaw) throw new Error("La data di chiusura è obbligatoria.");

  // Date-only -> chiusura a fine giornata (23:59 Europe/Rome) in UTC.
  const closesAtISO = dateEndOfDayToISO(closesOnRaw);

  const ruleId = await resolveRuleId(supabase, ruleIdField || null);

  const { data: poll, error } = await supabase
    .from("monthly_polls")
    .insert({
      title,
      month,
      year,
      closes_at: closesAtISO,
      rule_id: ruleId,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await generateAndInsertSlots(supabase, poll.id, ruleId, year, month);

  revalidatePath("/admin");
  redirect(`/admin/sondaggi/${poll.id}`);
}

/**
 * Duplica un sondaggio per il MESE SUCCESSIVO, riusando la stessa regola.
 * Crea un nuovo 'draft' con gli slot rigenerati e apre la sua pagina.
 */
export async function duplicatePoll(formData: FormData) {
  const { supabase } = await requireAdmin();
  const sourceId = String(formData.get("source_id") ?? "");
  if (!sourceId) throw new Error("Sondaggio di origine mancante.");

  const { data: src, error } = await supabase
    .from("monthly_polls")
    .select("rule_id, month, year")
    .eq("id", sourceId)
    .single();
  if (error) throw new Error(error.message);

  const nextMonth = src.month === 12 ? 1 : src.month + 1;
  const nextYear = src.month === 12 ? src.year + 1 : src.year;
  const ruleId = await resolveRuleId(supabase, src.rule_id);

  // Chiusura predefinita: ultimo giorno del mese a fine giornata (23:59 Europe/Rome).
  const closesAtISO = zonedWallTimeToISO(
    nextYear,
    nextMonth,
    lastDayOfMonth(nextYear, nextMonth),
    23,
    59
  );

  const { data: poll, error: insErr } = await supabase
    .from("monthly_polls")
    .insert({
      title: `Disponibilità ${monthYearLabel(nextMonth, nextYear)}`,
      month: nextMonth,
      year: nextYear,
      closes_at: closesAtISO,
      rule_id: ruleId,
      status: "draft",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);

  await generateAndInsertSlots(supabase, poll.id, ruleId, nextYear, nextMonth);

  revalidatePath("/admin");
  redirect(`/admin/sondaggi/${poll.id}`);
}

/** Cambia lo stato del sondaggio. Gestisce closed_at in modo coerente col DB. */
export async function setPollStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const pollId = String(formData.get("poll_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!pollId) throw new Error("Sondaggio mancante.");
  if (!["draft", "open", "closed"].includes(status))
    throw new Error("Stato non valido.");

  const patch: { status: string; closed_at: string | null } = {
    status,
    // 'closed' richiede closed_at valorizzato (CHECK); altrimenti azzerato.
    closed_at: status === "closed" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("monthly_polls")
    .update(patch)
    .eq("id", pollId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath(`/admin/sondaggi/${pollId}`);
}

/** Elimina un sondaggio (cascade su slot, risposte e join). */
export async function deletePoll(formData: FormData) {
  const { supabase } = await requireAdmin();
  const pollId = String(formData.get("poll_id") ?? "");
  if (!pollId) throw new Error("Sondaggio mancante.");

  const { error } = await supabase
    .from("monthly_polls")
    .delete()
    .eq("id", pollId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  redirect("/admin");
}
