-- =============================================================================
-- Seed opzionale — Regola ricorrente di esempio
--   martedì   (2) -> Mattina
--   venerdì   (5) -> Pomeriggio
--   sabato    (6) -> Mattina, Pomeriggio, Sera
--   domenica  (0) -> Pomeriggio
-- weekday: 0 = domenica ... 6 = sabato  (coerente con JavaScript Date.getDay())
--
-- Idempotente: non duplica la regola se già presente con lo stesso nome.
-- =============================================================================

do $$
declare
  v_rule_id uuid;
begin
  select id into v_rule_id
  from public.recurring_rules
  where name = 'Regola standard'
  limit 1;

  if v_rule_id is null then
    insert into public.recurring_rules (name)
    values ('Regola standard')
    returning id into v_rule_id;
  end if;

  insert into public.recurring_rule_days (rule_id, weekday, shift)
  values
    (v_rule_id, 2, 'Mattina'),
    (v_rule_id, 5, 'Pomeriggio'),
    (v_rule_id, 6, 'Mattina'),
    (v_rule_id, 6, 'Pomeriggio'),
    (v_rule_id, 6, 'Sera'),
    (v_rule_id, 0, 'Pomeriggio')
  on conflict (rule_id, weekday, shift) do nothing;
end $$;
