import type { PollStatus } from "@/lib/types";

const STYLES: Record<PollStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  open: "bg-green-100 text-green-800 ring-1 ring-green-300",
  closed: "bg-red-100 text-red-800 ring-1 ring-red-300",
};

const LABELS: Record<PollStatus, string> = {
  draft: "Bozza",
  open: "Aperto",
  closed: "Chiuso",
};

export function StatusBadge({ status }: { status: PollStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-base font-semibold ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
