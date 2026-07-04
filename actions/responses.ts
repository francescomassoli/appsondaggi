"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Flussi PARTECIPANTE (senza login). Usano la service_role key (server-only) con
// validazioni esplicite ad ogni chiamata:
//   - token sondaggio valido e sondaggio non 'draft'
//   - scritture consentite SOLO se status='open' e now() < closes_at
// Identificatore pratico unico nel sondaggio: il telefono (unique poll_id+phone).
// Il nome è obbligatorio ma modificabile e non fa parte dell'unicità.

// Limiti di input lato server (anti-abuso di base).
const MAX_NAME = 120;
const MAX_PHONE = 40;
const MAX_SLOTS = 200;

// Messaggi pubblici generici (nessun dettaglio interno).
const ERR_POLL_UNAVAILABLE = "Sondaggio non disponibile.";
const ERR_TEMPORARY = "Errore temporaneo. Riprova.";
const ERR_SAVE = "Errore nel salvataggio. Riprova.";

/** Normalizza gli slotIds: solo stringhe non vuote, deduplicate, con cap. */
function normalizeSlotIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return Array.from(new Set(cleaned)).slice(0, MAX_SLOTS);
}

type LookupResult =
  | { ok: true; name: string | null; slotIds: string[] }
  | { ok: false; error: string };

/**
 * Cerca una risposta esistente per (sondaggio, telefono).
 * Se esiste, restituisce nome e slot già selezionati (per il prefill);
 * altrimenti restituisce una risposta "vuota".
 */
export async function lookupResponse(
  token: string,
  phone: string
): Promise<LookupResult> {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  const cleanPhone = typeof phone === "string" ? phone.trim() : "";
  if (!cleanToken) return { ok: false, error: ERR_POLL_UNAVAILABLE };
  if (!cleanPhone) return { ok: false, error: "Inserisci il numero di telefono." };
  if (cleanPhone.length > MAX_PHONE)
    return { ok: false, error: "Numero di telefono troppo lungo." };

  const service = createSupabaseServiceClient();

  const { data: poll, error: pollErr } = await service
    .from("monthly_polls")
    .select("id, status")
    .eq("public_token", cleanToken)
    .maybeSingle();
  if (pollErr) return { ok: false, error: ERR_POLL_UNAVAILABLE };
  if (!poll || poll.status === "draft") {
    return { ok: false, error: ERR_POLL_UNAVAILABLE };
  }

  const { data: resp, error: respErr } = await service
    .from("poll_responses")
    .select("id, name")
    .eq("poll_id", poll.id)
    .eq("phone", cleanPhone)
    .maybeSingle();
  if (respErr) return { ok: false, error: ERR_TEMPORARY };
  if (!resp) return { ok: true, name: null, slotIds: [] };

  const { data: rs, error: rsErr } = await service
    .from("poll_response_slots")
    .select("slot_id")
    .eq("response_id", resp.id);
  if (rsErr) return { ok: false, error: ERR_TEMPORARY };

  return { ok: true, name: resp.name, slotIds: (rs ?? []).map((r) => r.slot_id) };
}

type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Crea o aggiorna la risposta del partecipante e sostituisce gli slot scelti.
 * Bloccata se il sondaggio non è aperto o è scaduto.
 */
export async function submitResponse(input: {
  token: string;
  name: string;
  phone: string;
  slotIds: string[];
}): Promise<SubmitResult> {
  const cleanToken = typeof input.token === "string" ? input.token.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";

  if (!cleanToken) return { ok: false, error: ERR_POLL_UNAVAILABLE };
  if (!name) return { ok: false, error: "Inserisci il tuo nome." };
  if (name.length > MAX_NAME)
    return { ok: false, error: "Il nome è troppo lungo." };
  if (!phone) return { ok: false, error: "Inserisci il numero di telefono." };
  if (phone.length > MAX_PHONE)
    return { ok: false, error: "Numero di telefono troppo lungo." };

  const slotIds = normalizeSlotIds(input.slotIds);

  const service = createSupabaseServiceClient();

  const { data: poll, error: pollErr } = await service
    .from("monthly_polls")
    .select("id, status, closes_at")
    .eq("public_token", cleanToken)
    .maybeSingle();
  if (pollErr) return { ok: false, error: ERR_POLL_UNAVAILABLE };
  if (!poll || poll.status === "draft") {
    return { ok: false, error: ERR_POLL_UNAVAILABLE };
  }

  // Scrittura consentita solo se aperto e non scaduto.
  if (poll.status !== "open" || new Date(poll.closes_at).getTime() <= Date.now()) {
    return {
      ok: false,
      error:
        "Il sondaggio è chiuso: non è più possibile inviare o modificare le risposte.",
    };
  }

  // Tieni solo gli slot che appartengono davvero a questo sondaggio.
  let validSlotIds: string[] = [];
  if (slotIds.length > 0) {
    const { data: validSlots, error: slotsErr } = await service
      .from("poll_slots")
      .select("id")
      .eq("poll_id", poll.id)
      .in("id", slotIds);
    if (slotsErr) return { ok: false, error: ERR_SAVE };
    // Deduplica per evitare righe duplicate da input client manipolato.
    validSlotIds = Array.from(new Set((validSlots ?? []).map((s) => s.id)));
  }

  // Upsert per (poll_id, phone): crea oppure aggiorna (anche il nome).
  const { data: resp, error: upErr } = await service
    .from("poll_responses")
    .upsert({ poll_id: poll.id, name, phone }, { onConflict: "poll_id,phone" })
    .select("id")
    .single();
  if (upErr || !resp) {
    return { ok: false, error: ERR_SAVE };
  }

  // Sostituzione completa delle selezioni.
  const { error: delErr } = await service
    .from("poll_response_slots")
    .delete()
    .eq("response_id", resp.id);
  if (delErr) return { ok: false, error: ERR_SAVE };

  if (validSlotIds.length > 0) {
    const rows = validSlotIds.map((slot_id) => ({
      response_id: resp.id,
      slot_id,
    }));
    const { error: insErr } = await service
      .from("poll_response_slots")
      .insert(rows);
    if (insErr) return { ok: false, error: ERR_SAVE };
  }

  return { ok: true };
}
