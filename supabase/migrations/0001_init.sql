-- =============================================================================
-- App Sondaggi disponibilità — Schema iniziale
-- Eseguire nel SQL Editor di Supabase (o via CLI).
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1) Regola ricorrente
-- -----------------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Una riga per ogni coppia (giorno della settimana, turno).
-- weekday: 0 = domenica ... 6 = sabato  (coerente con JavaScript Date.getDay())
create table if not exists public.recurring_rule_days (
  id        uuid primary key default gen_random_uuid(),
  rule_id   uuid not null references public.recurring_rules(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),
  shift     text not null check (shift in ('Mattina', 'Pomeriggio', 'Sera')),
  unique (rule_id, weekday, shift)
);

-- -----------------------------------------------------------------------------
-- 2) Sondaggio mensile
-- -----------------------------------------------------------------------------
create table if not exists public.monthly_polls (
  id            uuid primary key default gen_random_uuid(),
  rule_id       uuid references public.recurring_rules(id) on delete set null,
  title         text not null,
  month         smallint not null check (month between 1 and 12),
  year          smallint not null check (year between 2000 and 2100),
  status        text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at     timestamptz not null,
  closed_at     timestamptz,
  public_token  uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- (2) Coerenza: un sondaggio chiuso deve avere closed_at valorizzato.
  constraint closed_requires_closed_at
    check (status <> 'closed' or closed_at is not null)
);

create index if not exists idx_monthly_polls_status on public.monthly_polls (status);
create index if not exists idx_monthly_polls_closed_at on public.monthly_polls (closed_at);

-- -----------------------------------------------------------------------------
-- 3) Slot generati per il sondaggio
-- -----------------------------------------------------------------------------
create table if not exists public.poll_slots (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.monthly_polls(id) on delete cascade,
  slot_date  date not null,
  weekday    smallint not null check (weekday between 0 and 6),
  shift      text not null check (shift in ('Mattina', 'Pomeriggio', 'Sera')),
  unique (poll_id, slot_date, shift)
);

create index if not exists idx_poll_slots_poll on public.poll_slots (poll_id);

-- -----------------------------------------------------------------------------
-- 4) Risposta del partecipante (senza login)
--    Identificatore pratico unico nel sondaggio: il numero di telefono.
--    Il nome è obbligatorio ma resta modificabile e NON fa parte dell'unicità.
-- -----------------------------------------------------------------------------
create table if not exists public.poll_responses (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.monthly_polls(id) on delete cascade,
  name        text not null,
  phone       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (poll_id, phone)
);

create index if not exists idx_poll_responses_poll on public.poll_responses (poll_id);

-- (1) Trigger: aggiorna automaticamente updated_at ad ogni UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_poll_responses_updated_at on public.poll_responses;
create trigger trg_poll_responses_updated_at
  before update on public.poll_responses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) Slot selezionati da ciascuna risposta (join)
-- -----------------------------------------------------------------------------
create table if not exists public.poll_response_slots (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references public.poll_responses(id) on delete cascade,
  slot_id      uuid not null references public.poll_slots(id) on delete cascade,
  unique (response_id, slot_id)
);

create index if not exists idx_prs_response on public.poll_response_slots (response_id);
create index if not exists idx_prs_slot on public.poll_response_slots (slot_id);

-- =============================================================================
-- ROW LEVEL SECURITY
--  * RLS attiva su tutte le tabelle.
--  * "authenticated" (admin) = accesso completo (pagine admin).
--  * "anon" = nessuna policy => nessun accesso diretto dal browser.
--    I partecipanti operano solo via server action con service_role key,
--    che bypassa la RLS lato server applicando validazioni esplicite nel codice.
-- =============================================================================

alter table public.recurring_rules       enable row level security;
alter table public.recurring_rule_days   enable row level security;
alter table public.monthly_polls         enable row level security;
alter table public.poll_slots            enable row level security;
alter table public.poll_responses        enable row level security;
alter table public.poll_response_slots   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'recurring_rules', 'recurring_rule_days', 'monthly_polls',
    'poll_slots', 'poll_responses', 'poll_response_slots'
  ]
  loop
    execute format('drop policy if exists admin_all on public.%I;', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- RETENTION AUTOMATICA
-- Elimina i sondaggi chiusi da più di 30 giorni.
-- Cascade su slot/risposte/join via ON DELETE CASCADE => nessun record orfano.
-- =============================================================================

create or replace function public.delete_old_polls()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with removed as (
    delete from public.monthly_polls
    where status = 'closed'
      and closed_at is not null
      and closed_at < now() - interval '30 days'
    returning id
  )
  select count(*) into deleted_count from removed;
  return deleted_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- (3) Schedulazione pg_cron "sicura": se pg_cron non è disponibile o la
--     schedulazione fallisce, la migration NON si interrompe (solo NOTICE).
--     In tal caso configurare la retention manualmente (vedi README).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from cron.job where jobname = 'cleanup-old-polls') then
      perform cron.unschedule('cleanup-old-polls');
    end if;
    perform cron.schedule('cleanup-old-polls', '0 3 * * *',
                          'select public.delete_old_polls();');
    raise notice 'pg_cron: job "cleanup-old-polls" schedulato (ogni notte alle 03:00).';
  else
    raise notice 'pg_cron non disponibile: configurare la retention manualmente (vedi README).';
  end if;
exception when others then
  raise notice 'Schedulazione pg_cron non riuscita (%): configurare manualmente (vedi README).', sqlerrm;
end $$;
