begin;

create or replace function public.seed_default_report_cash_denominations(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_daily_report_id is null then
    return;
  end if;

  insert into public.report_cash_denominations (
    daily_report_id,
    denomination_value,
    note_count
  )
  select
    target_daily_report_id,
    default_values.denomination_value,
    0
  from (
    values
      (5000::numeric(12,2)),
      (1000::numeric(12,2)),
      (500::numeric(12,2)),
      (100::numeric(12,2)),
      (50::numeric(12,2)),
      (20::numeric(12,2)),
      (10::numeric(12,2)),
      (5::numeric(12,2)),
      (2::numeric(12,2)),
      (1::numeric(12,2))
  ) as default_values(denomination_value)
  where not exists (
    select 1
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_daily_report_id
      and rcd.denomination_value = default_values.denomination_value
  );
end;
$$;

comment on function public.seed_default_report_cash_denominations(uuid) is 'Ensures the standard 10 cash denomination rows exist for a daily report.';

create or replace function public.seed_default_report_cash_denominations_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_report_cash_denominations(new.id);
  return new;
end;
$$;

comment on function public.seed_default_report_cash_denominations_trigger() is 'Creates default denomination rows after a daily report is inserted.';

drop trigger if exists seed_default_report_cash_denominations_on_report_insert on public.daily_reports;
create trigger seed_default_report_cash_denominations_on_report_insert
after insert on public.daily_reports
for each row execute procedure public.seed_default_report_cash_denominations_trigger();

select public.seed_default_report_cash_denominations(dr.id)
from public.daily_reports dr
where dr.deleted_at is null;

create or replace function public.assert_daily_report_cash_denominations_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Cash denominations can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit cash denominations on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'cashier', 'driver') then
    raise exception 'You are not allowed to edit cash denominations.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_cash_denominations_editable(uuid) is 'Ensures cash denomination writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_cash_denomination_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_cash_denominations_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_cash_denomination_mutations() is 'Blocks cash denomination writes when the parent daily report is locked.';

drop trigger if exists guard_report_cash_denomination_mutations on public.report_cash_denominations;
create trigger guard_report_cash_denomination_mutations
before insert or update or delete on public.report_cash_denominations
for each row execute procedure public.guard_report_cash_denomination_mutations();

create or replace function public.save_report_cash_denominations(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_cash_denominations
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_denomination_value numeric(12,2);
  entry_note_count integer;
begin
  perform public.assert_daily_report_cash_denominations_editable(target_daily_report_id);
  perform public.seed_default_report_cash_denominations(target_daily_report_id);

  if input_entries is null then
    input_entries := '[]'::jsonb;
  end if;

  if jsonb_typeof(input_entries) <> 'array' then
    raise exception 'Batch payload must be a JSON array.' using errcode = '22023';
  end if;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    entry_denomination_value := (entry ->> 'denominationValue')::numeric(12,2);
    entry_note_count := (entry ->> 'noteCount')::integer;

    if entry_denomination_value not in (5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1) then
      raise exception 'Unsupported denomination value: %', entry_denomination_value using errcode = '23514';
    end if;

    if entry_note_count is null or entry_note_count < 0 then
      raise exception 'noteCount must be a non-negative whole number.' using errcode = '23514';
    end if;
  end loop;

  update public.report_cash_denominations
  set note_count = 0
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    update public.report_cash_denominations
    set note_count = (entry ->> 'noteCount')::integer
    where daily_report_id = target_daily_report_id
      and denomination_value = (entry ->> 'denominationValue')::numeric(12,2);
  end loop;

  return query
  select *
  from public.report_cash_denominations
  where daily_report_id = target_daily_report_id
  order by denomination_value desc;
end;
$$;

comment on function public.save_report_cash_denominations(uuid, jsonb) is 'Updates the standard denomination note counts for a daily report and returns the full ordered set.';

grant execute on function public.seed_default_report_cash_denominations(uuid) to authenticated;
grant execute on function public.assert_daily_report_cash_denominations_editable(uuid) to authenticated;
grant execute on function public.save_report_cash_denominations(uuid, jsonb) to authenticated;

commit;