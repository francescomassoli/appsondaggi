import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  WEEKDAY_LONG,
  formatDateLabel,
  formatDateTimeIt,
} from "@/lib/dates";

// Campo CSV con escaping (virgolette doppie).
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface SlotRow {
  slot_date: string;
  weekday: number;
  shift: string;
}
interface ResponseRow {
  name: string;
  phone: string;
  updated_at: string;
  poll_response_slots: { poll_slots: SlotRow | null }[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Solo admin autenticato.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Non autorizzato", { status: 401 });
  }

  const { data: poll } = await supabase
    .from("monthly_polls")
    .select("id, title, month, year")
    .eq("id", id)
    .maybeSingle();
  if (!poll) {
    return new Response("Sondaggio non trovato", { status: 404 });
  }

  const { data: responses } = await supabase
    .from("poll_responses")
    .select(
      "name, phone, updated_at, poll_response_slots(poll_slots(slot_date, weekday, shift))"
    )
    .eq("poll_id", poll.id)
    .order("name", { ascending: true });

  const header = [
    "Titolo sondaggio",
    "Nome",
    "Telefono",
    "Data",
    "Giorno",
    "Turno",
    "Data risposta",
  ];

  const lines: string[] = [header.map(csvField).join(";")];

  for (const r of (responses ?? []) as unknown as ResponseRow[]) {
    const slots = (r.poll_response_slots ?? [])
      .map((x) => x.poll_slots)
      .filter((s): s is SlotRow => s !== null)
      .sort((a, b) => a.slot_date.localeCompare(b.slot_date));

    const respDate = formatDateTimeIt(r.updated_at);

    if (slots.length === 0) {
      // Partecipante senza disponibilità selezionate: una riga comunque.
      lines.push(
        [poll.title, r.name, r.phone, "", "", "", respDate]
          .map(csvField)
          .join(";")
      );
      continue;
    }

    for (const s of slots) {
      lines.push(
        [
          poll.title,
          r.name,
          r.phone,
          formatDateLabel(s.slot_date),
          WEEKDAY_LONG[s.weekday],
          s.shift,
          respDate,
        ]
          .map(csvField)
          .join(";")
      );
    }
  }

  // BOM UTF-8 + CRLF: apertura corretta in Excel (anche con accenti).
  const csv = "﻿" + lines.join("\r\n");
  const filename = `disponibilita_${poll.year}_${String(poll.month).padStart(
    2,
    "0"
  )}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
