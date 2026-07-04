"use client";

import { useMemo, useState } from "react";
import { lookupResponse, submitResponse } from "@/actions/responses";
import { formatDateLabel } from "@/lib/dates";
import type { PollStatus, Shift } from "@/lib/types";

interface SlotItem {
  id: string;
  slot_date: string;
  shift: Shift;
}

type Step = "identify" | "slots" | "done";

export function ParticipantForm({
  token,
  status,
  slots,
}: {
  token: string;
  status: PollStatus;
  slots: SlotItem[];
}) {
  const isClosed = status !== "open";

  const [step, setStep] = useState<Step>("identify");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Raggruppa gli slot per data (già ordinati per data e turno).
  const groups = useMemo(() => {
    const out: { date: string; items: SlotItem[] }[] = [];
    for (const s of slots) {
      const last = out[out.length - 1];
      if (last && last.date === s.slot_date) last.items.push(s);
      else out.push({ date: s.slot_date, items: [s] });
    }
    return out;
  }, [slots]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // evita doppio invio
    // Richiede sia nome che telefono prima di proseguire.
    if (!name.trim()) {
      setError("Inserisci il tuo nome.");
      return;
    }
    if (!phone.trim()) {
      setError("Inserisci il numero di telefono.");
      return;
    }
    setLoading(true);
    setError(null);
    // Il prefill avviene per telefono; se esiste una risposta con un nome
    // salvato, sostituiamo il nome con quello memorizzato.
    const res = await lookupResponse(token, phone);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.name) setName(res.name);
    setSelected(new Set(res.slotIds));
    setStep("slots");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // evita doppio invio
    setLoading(true);
    setError(null);
    const res = await submitResponse({
      token,
      name,
      phone,
      slotIds: Array.from(selected),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep("done");
  }

  // ---- Conferma finale ----
  if (step === "done") {
    return (
      <div className="card space-y-4 text-center">
        <div className="text-5xl" aria-hidden>
          ✅
        </div>
        <h2 className="text-2xl font-bold">Grazie, {name}!</h2>
        <p className="text-lg text-slate-700">
          La tua disponibilità è stata salvata correttamente.
        </p>
        <p className="text-slate-600">
          Puoi modificarla quando vuoi finché il sondaggio è aperto.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setStep("slots")}
        >
          Modifica le mie risposte
        </button>
      </div>
    );
  }

  // ---- Passo 1: identificazione ----
  if (step === "identify") {
    return (
      <form onSubmit={handleContinue} className="card space-y-5">
        <p className="text-lg text-slate-700">
          Inserisci il tuo nome e il numero di telefono per iniziare.
        </p>
        <div>
          <label className="label" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            type="text"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Numero di telefono
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            className="field"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            required
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Attendere…" : "Continua"}
        </button>
      </form>
    );
  }

  // ---- Passo 2: selezione slot ----
  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name2">
            Nome
          </label>
          <input
            id="name2"
            type="text"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isClosed}
            required
          />
        </div>
        <p className="text-lg font-semibold text-slate-800">
          Seleziona i giorni e i turni in cui sei disponibile:
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="card text-slate-600">
          Non ci sono date disponibili per questo mese.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.date} className="card">
              <div className="mb-3 text-xl font-semibold">
                {formatDateLabel(g.date)}
              </div>
              <div className="space-y-2">
                {g.items.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 px-4 py-4 ${
                        checked
                          ? "border-brand bg-blue-50"
                          : "border-slate-200 hover:bg-slate-50"
                      } ${isClosed ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="h-7 w-7"
                        checked={checked}
                        onChange={() => toggle(s.id)}
                        disabled={isClosed}
                      />
                      <span className="text-lg">{s.shift}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>
      )}

      {isClosed ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-slate-700">
          Il sondaggio è chiuso: puoi vedere le tue risposte ma non modificarle.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? "Salvataggio…" : "Salva la mia disponibilità"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setStep("identify");
              setError(null);
            }}
          >
            Indietro
          </button>
        </div>
      )}
    </form>
  );
}
