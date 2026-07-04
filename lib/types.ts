// Tipi condivisi, allineati allo schema in supabase/migrations/0001_init.sql

export type Shift = "Mattina" | "Pomeriggio" | "Sera";

export const SHIFTS: Shift[] = ["Mattina", "Pomeriggio", "Sera"];

export type PollStatus = "draft" | "open" | "closed";

export interface RecurringRule {
  id: string;
  name: string;
  created_at: string;
}

export interface RecurringRuleDay {
  id: string;
  rule_id: string;
  weekday: number; // 0 = domenica ... 6 = sabato
  shift: Shift;
}

export interface MonthlyPoll {
  id: string;
  rule_id: string | null;
  title: string;
  month: number; // 1..12
  year: number;
  status: PollStatus;
  closes_at: string;
  closed_at: string | null;
  public_token: string;
  created_at: string;
}

export interface PollSlot {
  id: string;
  poll_id: string;
  slot_date: string; // 'YYYY-MM-DD'
  weekday: number;
  shift: Shift;
}

export interface PollResponse {
  id: string;
  poll_id: string;
  name: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface PollResponseSlot {
  id: string;
  response_id: string;
  slot_id: string;
}
