import "server-only";
import { createSupabaseServiceClient } from "./supabase/service";
import type { MonthlyPoll, PollSlot } from "./types";

export type PublicPoll = Pick<
  MonthlyPoll,
  "id" | "title" | "month" | "year" | "status" | "closes_at" | "public_token"
>;

export interface PublicPollData {
  poll: PublicPoll;
  slots: PollSlot[];
}

/**
 * Carica il sondaggio pubblico dal token, SOLO se non è in 'draft'.
 * Restituisce gli slot ordinati per data e turno. Usato dalla pagina /s/[token].
 * In caso di token vuoto, sondaggio assente/draft o errore DB restituisce null.
 */
export async function getPublicPollByToken(
  token: string
): Promise<PublicPollData | null> {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  if (!cleanToken) return null;

  const service = createSupabaseServiceClient();

  const { data: poll, error: pollErr } = await service
    .from("monthly_polls")
    .select("id, title, month, year, status, closes_at, public_token")
    .eq("public_token", cleanToken)
    .maybeSingle();
  if (pollErr) return null;
  if (!poll || poll.status === "draft") return null;

  const { data: slots, error: slotsErr } = await service
    .from("poll_slots")
    .select("id, poll_id, slot_date, weekday, shift")
    .eq("poll_id", poll.id)
    .order("slot_date", { ascending: true })
    .order("shift", { ascending: true });
  if (slotsErr) return null;

  return {
    poll: poll as PublicPoll,
    slots: (slots ?? []) as PollSlot[],
  };
}
