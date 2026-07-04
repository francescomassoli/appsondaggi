# HANDOFF — App Sondaggi disponibilità (V1)

> Documento di passaggio per riprendere il lavoro in una nuova conversazione.
> Aggiornato al termine della sessione di sviluppo V1.

---

## 1. Cos'è il progetto

Mini-app web per raccogliere **disponibilità mensili ricorrenti**.
L'admin definisce una **regola ricorrente** (giorni della settimana × turni
`Mattina`/`Pomeriggio`/`Sera`, **solo etichette, senza orari**), sceglie un mese e
l'app genera automaticamente gli slot. I partecipanti rispondono **senza login**
tramite link pubblico, con UX semplice adatta ad anziani. L'admin vede le risposte
ed esporta in CSV. I sondaggi chiusi da >30 giorni vengono eliminati automaticamente.

**Stack**: Next.js 15.5.19 (App Router) · TypeScript · Supabase (Postgres + Auth) ·
Tailwind CSS v3 · CSV server-side.

**Lingua UI**: italiano. **Fuso di riferimento**: `Europe/Rome`.

---

## 2. Stato attuale — VERIFICATO

- `npm run typecheck` → **pulito** (exit 0, nessun errore).
- `npm run build` → **verde** (build di produzione completata).
- Sicurezza dipendenze: **CVE critico Next.js risolto** (aggiornato a 15.5.19).
  Restano **2 vulnerabilità moderate** non bloccanti (vedi §9).

⚠️ **NON ancora verificato**: l'esecuzione end-to-end reale contro un progetto
Supabase vero (finora solo typecheck + build locali). Vedi §7 per il primo test.

---

## 3. Decisioni di prodotto già prese (NON ridiscutere senza motivo)

- **Auth admin**: Supabase Auth email/password. Admin creato dal dashboard Supabase.
- **Retention**: `pg_cron` (job notturno) + cancellazione a cascata via FK.
- **Identità partecipante (simplicity-first)**: identificatore pratico **unico =
  telefono** per singolo sondaggio → `unique(poll_id, phone)`. Il **nome è
  obbligatorio ma modificabile** e NON fa parte dell'unicità. Niente login/OTP/
  magic-link/edit-link.
- **Chiusura sondaggio**: input **solo data** (date-only); il sistema la interpreta
  come **fine giornata 23:59 Europe/Rome**, convertita in UTC in modo deterministico
  (DST-safe) — vedi `lib/dates.ts`.
- **Turni**: tre etichette fisse, senza orari associati.
- **Bonus inclusi**: duplica sondaggio per mese successivo, badge Aperto/Chiuso,
  conferma finale dopo invio risposta.
- **Confine sicurezza**: tutte le interazioni partecipante passano da **server action
  con service-role key** (mai dal browser); l'anon key serve solo al login admin.

---

## 4. Struttura del codice (file principali)

```
app/
  layout.tsx                      root (lang=it)
  globals.css                     Tailwind v3 + classi .btn/.field/.card (alto contrasto, font grandi)
  page.tsx                        redirect -> /admin
  login/page.tsx                  login admin (client, supabase browser)
  admin/
    layout.tsx                    guard requireAdmin + nav + logout
    page.tsx                      dashboard sondaggi + badge stato
    regole/page.tsx               editor regola (checkbox giorni × turni)
    sondaggi/nuovo/page.tsx       crea sondaggio (date-only) + duplica
    sondaggi/[id]/page.tsx        dettaglio: stato, link pubblico, risposte, slot, export, elimina, duplica
  s/[token]/page.tsx              pagina pubblica partecipante
  api/export/[id]/route.ts        download CSV (admin, ; + BOM per Excel)
actions/
  auth.ts                         signOut
  rules.ts                        saveRecurringRule (sostituzione giorni regola)
  polls.ts                        createPoll, duplicatePoll, setPollStatus, deletePoll, generazione slot
  responses.ts                    lookupResponse, submitResponse (service-role, validazioni, hardening)
lib/
  supabase/server.ts              client server (sessione admin, RLS authenticated)
  supabase/service.ts             client service-role (import "server-only")
  supabase/client.ts              client browser (solo login)
  auth.ts                         requireAdmin()
  dates.ts                        generazione slot, formattazione IT, conversioni Europe/Rome<->UTC
  public-data.ts                  getPublicPollByToken (server-only, loader pagina pubblica)
  types.ts                        tipi condivisi (Shift, PollStatus, ecc.)
components/
  StatusBadge.tsx                 badge Bozza/Aperto/Chiuso
  ConfirmSubmit.tsx               bottone submit con conferma (per elimina)
  ParticipantForm.tsx            form pubblico 3-step (identify → slots → done)
middleware.ts                     protegge /admin/*
supabase/
  migrations/0001_init.sql        schema + RLS + retention + pg_cron
  seed.sql                        regola esempio
.env.example                      template variabili
```

---

## 5. Database (riassunto schema)

Tabelle: `recurring_rules`, `recurring_rule_days`, `monthly_polls`, `poll_slots`,
`poll_responses`, `poll_response_slots`.

Punti chiave:
- FK figlie con `ON DELETE CASCADE` → eliminando un poll spariscono slot/risposte/join.
- `monthly_polls`: `status` ∈ draft/open/closed, `closes_at` (timestamptz),
  `closed_at`, `public_token` (uuid unico), CHECK `status<>'closed' OR closed_at IS NOT NULL`.
- `poll_responses`: **`unique(poll_id, phone)`** — richiesto dall'upsert
  `onConflict: "poll_id,phone"` in `actions/responses.ts`. Trigger `set_updated_at`.
- RLS attiva su tutte le tabelle: policy full-access solo per `authenticated` (admin);
  `anon` nessun accesso diretto (i partecipanti operano via service-role server-side).
- `delete_old_polls()`: elimina i poll `closed` con `closed_at < now() - 30 giorni`.
- Schedulazione pg_cron in blocco `DO` "sicuro" (non fa fallire la migration se pg_cron
  non è disponibile; in tal caso eseguire la funzione manualmente / cron esterno).

---

## 6. Setup ambiente

### Variabili (`.env.local`, NON committare)
```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase > Project Settings > API > Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # ... > anon public
SUPABASE_SERVICE_ROLE_KEY=       # ... > service_role  (SEGRETA, solo server)
```

### Comandi
```
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run build
```

### Supabase
1. Esegui `supabase/migrations/0001_init.sql` nel SQL Editor.
2. (Opzionale) esegui `supabase/seed.sql` per la regola esempio.
3. Crea l'admin: Authentication > Users > Add user (email + password).
4. Retention automatica: abilita l'estensione **pg_cron** (Database > Extensions).
   In alternativa esegui manualmente `select delete_old_polls();`.

---

## 7. PRIMO TEST END-TO-END da fare (priorità in nuova sessione)

1. Configura `.env.local`, esegui migration + seed, crea admin, `npm run dev`.
2. `/login` → entra come admin.
3. `/admin/regole` → verifica/salva la regola.
4. `/admin/sondaggi/nuovo` → crea "Agosto 2026" (mese=Agosto, anno=2026, data
   chiusura futura) → controlla che gli slot del mese siano generati nel dettaglio.
5. Dettaglio → **Apri sondaggio** → copia link pubblico `/s/<token>`.
6. In incognito: nome + telefono → seleziona slot → **Salva** → conferma.
7. Riapri con lo **stesso telefono** → selezioni precompilate → modifica → risalva.
8. Dettaglio → controlla risposta → **Esporta CSV** → apri in Excel (accenti/colonne ok).
9. **Chiudi sondaggio** → dal link pubblico verifica blocco salvataggio.
10. Retention: imposta `closed_at` a >30 giorni fa e lancia `select delete_old_polls();`
    → poll e dati collegati eliminati (cascade, nessun orfano).

---

## 8. Cosa resta da fare (TODO)

### Necessario per chiudere la V1
- [ ] **Test end-to-end reale** su Supabase (§7) e correzione di eventuali problemi
      emersi solo a runtime (es. dettagli RLS, formati CSV, fuso orario reale).
- [ ] **README** finale (prerequisiti, installazione, config Supabase, primo admin,
      primo sondaggio, retention, export CSV, note deploy Vercel). NON ancora scritto.
- [ ] Verificare il comportamento `closes_at` con il **TZ del runtime** in deploy
      (in locale ok; la conversione è ancorata a Europe/Rome via Intl, ma confermare).

### Deploy (Vercel) — da impostare
- [ ] Impostare le 3 variabili d'ambiente su Vercel (anon/url come public, service_role
      come secret server-only).
- [ ] Valutare `TZ=Europe/Rome` come env su Vercel (la logica è già DST-safe via Intl,
      ma utile per coerenza di eventuali log/date runtime).
- [ ] Decidere strategia retention in produzione: pg_cron su Supabase (preferito) oppure
      cron esterno che invoca `delete_old_polls()`.

### Sicurezza / manutenzione
- [ ] Risolvere le **2 vulnerabilità moderate** residue (vedi §9) quando possibile.
- [ ] (Opzionale, non richiesto) rate-limiting basico sulle azioni pubbliche.

### Esplicitamente NON in scope V1 (non implementare senza richiesta)
- Auth forte/OTP/magic-link per partecipanti, edit-link privati.
- Multi-regola gestita da UI (lo schema la supporta, la UI usa una sola regola).
- i18n, temi, notifiche email.

---

## 9. Note / problemi noti

- **Vulnerabilità residue**: dopo l'upgrade a Next 15.5.19 `npm audit` riporta
  **2 moderate** (non critiche). Il critical precedente è risolto.
- **Warning build (non bloccante)**: `@supabase/supabase-js` usa `process.version`
  non supportato in Edge Runtime — proviene dal middleware. È solo un warning; la
  build passa. Se in futuro desse problemi, valutare di non usare supabase nel
  middleware o forzare runtime Node.
- **package.json**: `next` è fissato a `15.5.19` (patch sicura nella linea 15).
- **Convenzione weekday**: 0=domenica … 6=sabato (coerente con `Date.getDay()`),
  usata sia in SQL sia in TS.

---

## 10. Modalità di lavoro concordata con l'utente

L'utente lavora con **review stretta**: in caso di modifiche a file sensibili
(soprattutto flusso pubblico/partecipante e confine service-role) mostrare il file
**per intero** prima di scrivere e **attendere approvazione**, un file alla volta.
Niente auto-continue su più file. Niente feature extra o refactor non richiesti.
Preferenza per robustezza e chiarezza rispetto a soluzioni "furbe".
