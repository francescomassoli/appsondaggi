import { notFound } from "next/navigation";
import { getPublicPollByToken } from "@/lib/public-data";
import { ParticipantForm } from "@/components/ParticipantForm";
import { StatusBadge } from "@/components/StatusBadge";
import { monthYearLabel, formatDateTimeIt } from "@/lib/dates";
import type { Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PublicPollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPublicPollByToken(token);
  if (!data) notFound();

  const { poll, slots } = data;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{poll.title}</h1>
          <StatusBadge status={poll.status} />
        </div>
        <p className="text-slate-600">{monthYearLabel(poll.month, poll.year)}</p>
        {poll.status === "open" ? (
          <p className="mt-1 text-slate-600">
            Puoi rispondere fino al {formatDateTimeIt(poll.closes_at)}.
          </p>
        ) : (
          <p className="mt-1 font-semibold text-red-700">
            Questo sondaggio è chiuso: le risposte non sono più modificabili.
          </p>
        )}
      </header>

      <ParticipantForm
        token={poll.public_token}
        status={poll.status}
        slots={(slots ?? []).map((s) => ({
          id: s.id,
          slot_date: s.slot_date,
          shift: s.shift as Shift,
        }))}
      />
    </main>
  );
}
