begin;

create or replace function public.assert_daily_report_expenses_editable(target_daily_report_id uuid)
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
    raise exception 'Expense entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit expense entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'cashier', 'driver') then
    raise exception 'You are not allowed to edit expense entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_expenses_editable(uuid) is 'Ensures report expense writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_expense_mutations()
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

  perform public.assert_daily_report_expenses_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_expense_mutations() is 'Blocks insert, update, and delete on expense entries when the parent daily report is locked.';

drop trigger if exists guard_report_expense_mutations on public.report_expenses;
create trigger guard_report_expense_mutations
before insert or update or delete on public.report_expenses
for each row execute procedure public.guard_report_expense_mutations();

create or replace function public.save_report_expenses(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_line_no integer;
  entry_expense_category_id uuid;
  entry_custom_expense_name text;
  entry_amount numeric(14,2);
begin
  perform public.assert_daily_report_expenses_editable(target_daily_report_id);

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
    entry_id := null;
    if coalesce(entry ->> 'id', '') <> '' then
      entry_id := (entry ->> 'id')::uuid;

      if not exists (
        select 1
        from public.report_expenses re
        where re.id = entry_id
          and re.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Expense entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_line_no := (entry ->> 'lineNo')::integer;
    entry_expense_category_id := nullif(entry ->> 'expenseCategoryId', '')::uuid;
    entry_custom_expense_name := nullif(trim(coalesce(entry ->> 'customExpenseName', '')), '');
    entry_amount := coalesce((entry ->> 'amount')::numeric, 0);

    if entry_line_no is null or entry_line_no < 1 then
      raise exception 'Each expense entry must include a positive lineNo.' using errcode = '23514';
    end if;

    if entry_expense_category_id is null and entry_custom_expense_name is null then
      raise exception 'Each expense entry must include either expenseCategoryId or customExpenseName.' using errcode = '23514';
    end if;

    if entry_expense_category_id is not null and not exists (
      select 1
      from public.expense_categories ec
      where ec.id = entry_expense_category_id
        and ec.is_active = true
    ) then
      raise exception 'The selected expense category does not exist or is inactive.' using errcode = '23503';
    end if;

    if entry_amount < 0 then
      raise exception 'Expense amount must be non-negative.' using errcode = '23514';
    end if;
  end loop;

  delete from public.report_expenses
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_expenses (
      id,
      daily_report_id,
      line_no,
      expense_category_id,
      custom_expense_name,
      amount,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'lineNo')::integer,
      nullif(entry ->> 'expenseCategoryId', '')::uuid,
      nullif(trim(coalesce(entry ->> 'customExpenseName', '')), ''),
      coalesce((entry ->> 'amount')::numeric, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_expenses
  where daily_report_id = target_daily_report_id
  order by line_no asc;
end;
$$;

comment on function public.save_report_expenses(uuid, jsonb) is 'Atomically replaces a report expense set using frontend table order as the authoritative line ordering.';

grant execute on function public.assert_daily_report_expenses_editable(uuid) to authenticated;
grant execute on function public.save_report_expenses(uuid, jsonb) to authenticated;

commit;