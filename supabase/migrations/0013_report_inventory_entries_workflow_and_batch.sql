begin;

create or replace function public.populate_report_inventory_entry_snapshot()
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

comment on function public.populate_report_inventory_entry_snapshot() is 'Hydrates inventory snapshot fields from the selected product before write.';

drop trigger if exists populate_report_inventory_entry_snapshot on public.report_inventory_entries;
create trigger populate_report_inventory_entry_snapshot
before insert or update of product_id on public.report_inventory_entries
for each row execute procedure public.populate_report_inventory_entry_snapshot();

create or replace function public.assert_daily_report_inventory_entries_editable(target_daily_report_id uuid)
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
    raise exception 'Inventory entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit inventory entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit inventory entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_inventory_entries_editable(uuid) is 'Ensures inventory writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_inventory_entry_mutations()
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

  perform public.assert_daily_report_inventory_entries_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_inventory_entry_mutations() is 'Blocks inventory entry writes when the parent daily report is locked.';

drop trigger if exists guard_report_inventory_entry_mutations on public.report_inventory_entries;
create trigger guard_report_inventory_entry_mutations
before insert or update or delete on public.report_inventory_entries
for each row execute procedure public.guard_report_inventory_entry_mutations();

create or replace function public.save_report_inventory_entries(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_inventory_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_loading_qty integer;
  entry_sales_qty integer;
  entry_lorry_qty integer;
begin
  perform public.assert_daily_report_inventory_entries_editable(target_daily_report_id);

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
        from public.report_inventory_entries rie
        where rie.id = entry_id
          and rie.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Inventory entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_loading_qty := coalesce((entry ->> 'loadingQty')::integer, 0);
    entry_sales_qty := coalesce((entry ->> 'salesQty')::integer, 0);
    entry_lorry_qty := coalesce((entry ->> 'lorryQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_sales_qty > entry_loading_qty then
      raise exception 'salesQty cannot exceed loadingQty.' using errcode = '23514';
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

  delete from public.report_inventory_entries
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_inventory_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      loading_qty,
      sales_qty,
      lorry_qty
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      coalesce((entry ->> 'loadingQty')::integer, 0),
      coalesce((entry ->> 'salesQty')::integer, 0),
      coalesce((entry ->> 'lorryQty')::integer, 0)
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by product_name_snapshot asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is 'Atomically replaces a report inventory set with one row per product and auto-filled product snapshots.';

grant execute on function public.assert_daily_report_inventory_entries_editable(uuid) to authenticated;
grant execute on function public.save_report_inventory_entries(uuid, jsonb) to authenticated;

commit;