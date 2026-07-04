import { SHIFTS, type Shift } from "./types";

// Nomi in italiano. weekday: 0 = domenica ... 6 = sabato (come Date.getDay()).
export const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
export const WEEKDAY_LONG = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];
export const MONTH_SHORT = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];
export const MONTH_LONG = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Nome lungo del mese (1..12). */
export function monthName(month: number): string {
  return MONTH_LONG[month - 1] ?? String(month);
}

/** "Agosto 2026" */
export function monthYearLabel(month: number, year: number): string {
  return `${monthName(month)} ${year}`;
}

export interface GeneratedSlot {
  slot_date: string; // 'YYYY-MM-DD'
  weekday: number;
  shift: Shift;
}

/**
 * Genera tutti gli slot del mese in base alla regola ricorrente.
 * Per ogni giorno del mese il cui weekday è presente nella regola,
 * crea uno slot per ciascun turno associato (nell'ordine canonico SHIFTS).
 */
export function generateSlots(
  year: number,
  month: number, // 1..12
  ruleDays: { weekday: number; shift: Shift }[]
): GeneratedSlot[] {
  // Mappa weekday -> insieme dei turni richiesti
  const byWeekday = new Map<number, Set<Shift>>();
  for (const d of ruleDays) {
    if (!byWeekday.has(d.weekday)) byWeekday.set(d.weekday, new Set());
    byWeekday.get(d.weekday)!.add(d.shift);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const slots: GeneratedSlot[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(year, month - 1, day).getDay();
    const shifts = byWeekday.get(weekday);
    if (!shifts) continue;
    const slotDate = `${year}-${pad(month)}-${pad(day)}`;
    for (const shift of SHIFTS) {
      if (shifts.has(shift)) {
        slots.push({ slot_date: slotDate, weekday, shift });
      }
    }
  }
  return slots;
}

/** Da 'YYYY-MM-DD' a [year, month(1..12), day]. */
function parseDate(slotDate: string): [number, number, number] {
  const [y, m, d] = slotDate.split("-").map(Number);
  return [y, m, d];
}

/** Etichetta breve di uno slot: "Mar 4 ago 2026 — Mattina" */
export function formatSlotLabel(slotDate: string, shift: Shift): string {
  const [y, m, d] = parseDate(slotDate);
  const weekday = new Date(y, m - 1, d).getDay();
  return `${WEEKDAY_SHORT[weekday]} ${d} ${MONTH_SHORT[m - 1]} ${y} — ${shift}`;
}

/** Solo la parte data: "Mar 4 ago 2026" */
export function formatDateLabel(slotDate: string): string {
  const [y, m, d] = parseDate(slotDate);
  const weekday = new Date(y, m - 1, d).getDay();
  return `${WEEKDAY_SHORT[weekday]} ${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/** Data/ora leggibile in italiano per la scadenza (closes_at ISO), fuso Europe/Rome. */
export function formatDateTimeIt(iso: string): string {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

// =============================================================================
// Time zone — conversioni deterministiche Europe/Rome <-> UTC (DST-safe).
// =============================================================================

export const APP_TIMEZONE = "Europe/Rome";

/** Offset (in minuti) della time zone all'istante dato. Es. Europe/Rome estate => 120. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return (asUTC - instant.getTime()) / 60000;
}

/**
 * Converte un orario "da calendario" (wall-clock) espresso nella time zone indicata
 * in un timestamp ISO UTC, DETERMINISTICO e indipendente dal fuso del runtime.
 * Gestisce correttamente l'ora legale (DST).
 */
export function zonedWallTimeToISO(
  year: number,
  month: number, // 1..12
  day: number,
  hour: number,
  minute: number,
  timeZone: string = APP_TIMEZONE
): string {
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = tzOffsetMinutes(new Date(wallAsUTC), timeZone);
  let utc = wallAsUTC - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(utc), timeZone);
  if (offset2 !== offset) {
    utc = wallAsUTC - offset2 * 60000;
  }
  return new Date(utc).toISOString();
}

/**
 * Converte una data "YYYY-MM-DD" (input type="date") nella CHIUSURA a fine giornata:
 * 23:59 ora di Europe/Rome di quel giorno, come timestamp ISO UTC.
 */
export function dateEndOfDayToISO(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Formato data non valido.");
  return zonedWallTimeToISO(Number(m[1]), Number(m[2]), Number(m[3]), 23, 59);
}

/** Ultimo giorno del mese (1..12), indipendente dal fuso. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
