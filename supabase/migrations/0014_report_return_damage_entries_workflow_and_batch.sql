begin;

create or replace function public.populate_report_return_damage_entry_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_product public.products%rowtype;
begin
  select *
  into source_product
  from public.products
  where id = new.product_id
    and is_active = true;

  if not found then
    raise exception 'Selected product was not found or is inactive.' using errcode = '23503';
  end if;

  new.product_code_snapshot := source_product.product_code;
  new.product_name_snapshot := source_product.product_name;
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_return_damage_entry_snapshot() is 'Hydrates return and damage snapshot fields from the selected product before write.';

drop trigger if exists populate_report_return_damage_entry_snapshot on public.report_return_damage_entries;
create trigger populate_report_return_damage_entry_snapshot
before insert or update of product_id on public.report_return_damage_entries
for each row execute procedure public.populate_report_return_damage_entry_snapshot();

create or replace function public.assert_daily_report_return_damage_entries_editable(target_daily_report_id uuid)
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
    raise exception 'Return and damage entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit return and damage entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit return and damage entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_return_damage_entries_editable(uuid) is 'Ensures return and damage writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_return_damage_entry_mutations()
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

  perform public.assert_daily_report_return_damage_entries_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_return_damage_entry_mutations() is 'Blocks return and damage writes when the parent daily report is locked.';

drop trigger if exists guard_report_return_damage_entry_mutations on public.report_return_damage_entries;
create trigger guard_report_return_damage_entry_mutations
before insert or update or delete on public.report_return_damage_entries
for each row execute procedure public.guard_report_return_damage_entry_mutations();

create or replace function public.save_report_return_damage_entries(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_return_damage_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_damage_qty integer;
  entry_return_qty integer;
  entry_free_issue_qty integer;
begin
  perform public.assert_daily_report_return_damage_entries_editable(target_daily_report_id);

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
        from public.report_return_damage_entries rrde
        where rrde.id = entry_id
          and rrde.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Return or damage entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_damage_qty := coalesce((entry ->> 'damageQty')::integer, 0);
    entry_return_qty := coalesce((entry ->> 'returnQty')::integer, 0);
    entry_free_issue_qty := coalesce((entry ->> 'freeIssueQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each return or damage entry must include productId.' using errcode = '23514';
    end if;

    if entry_damage_qty < 0 or entry_return_qty < 0 or entry_free_issue_qty < 0 then
      raise exception 'Return and damage quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_damage_qty + entry_return_qty + entry_free_issue_qty <= 0 then
      raise exception 'At least one of damageQty, returnQty, or freeIssueQty must be greater than zero.' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.products p
      where p.id = entry_product_id
        and p.is_active = true
    ) then
      raise exception 'Selected product was not found or is inactive.' using errcode = '23503';
    end if;
  end loop;

  delete from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_return_damage_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      invoice_no,
      shop_name,
      damage_qty,
      return_qty,
      free_issue_qty,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      nullif(trim(coalesce(entry ->> 'invoiceNo', '')), ''),
      nullif(trim(coalesce(entry ->> 'shopName', '')), ''),
      coalesce((entry ->> 'damageQty')::integer, 0),
      coalesce((entry ->> 'returnQty')::integer, 0),
      coalesce((entry ->> 'freeIssueQty')::integer, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id
  order by created_at asc;
end;
$$;

comment on function public.save_report_return_damage_entries(uuid, jsonb) is 'Atomically replaces a report return and damage set with auto-filled product snapshots and generated qty/value.';

grant execute on function public.assert_daily_report_return_damage_entries_editable(uuid) to authenticated;
grant execute on function public.save_report_return_damage_entries(uuid, jsonb) to authenticated;

commit;