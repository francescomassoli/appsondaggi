import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { monthYearLabel, formatDateTimeIt } from "@/lib/dates";
import type { PollStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const { data: polls } = await supabase
    .from("monthly_polls")
    .select("id, title, month, year, status, closes_at, created_at")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Sondaggi</h1>
        <Link href="/admin/sondaggi/nuovo" className="btn-primary">
          + Nuovo sondaggio
        </Link>
      </div>

      {!polls || polls.length === 0 ? (
        <div className="card text-slate-600">
          Nessun sondaggio presente. Crea il primo con “Nuovo sondaggio”.
        </div>
      ) : (
        <ul className="space-y-3">
          {polls.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/sondaggi/${p.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 transition hover:border-brand"
              >
                <div>
                  <div className="text-xl font-semibold">{p.title}</div>
                  <div className="text-slate-600">
                    {monthYearLabel(p.month, p.year)} · chiusura{" "}
                    {formatDateTimeIt(p.closes_at)}
                  </div>
                </div>
                <StatusBadge status={p.status as PollStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
