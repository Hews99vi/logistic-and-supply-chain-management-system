begin;

-- Dedicated route-day stock movement save function.
-- This keeps morning loading edits independent from the broader DATE inventory
-- save RPC, while still using the authenticated user context and existing
-- inventory mutation guards.

create or replace function public.save_loading_summary_items(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_inventory_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_loading_qty integer;
  entry_sales_qty integer;
  entry_lorry_qty integer;
  existing_count integer;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'Only admin, supervisor, or driver can edit loading items.' using errcode = '42501';
  end if;

  select *
  into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  select rp.organization_id
  into org_id
  from public.route_programs rp
  where rp.id = report_row.route_program_id;

  if org_id is null then
    raise exception 'Route organization was not found for this loading summary.' using errcode = 'P0002';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> actor_id then
    raise exception 'Drivers can only edit loading items on their own summaries.' using errcode = '42501';
  end if;

  if report_row.status <> 'draft' then
    raise exception 'Loading items can only be edited while the route-day sheet is in draft status.' using errcode = 'P0001';
  end if;

  if input_entries is null then
    input_entries := '[]'::jsonb;
  end if;

  if jsonb_typeof(input_entries) <> 'array' then
    raise exception 'Loading item payload must be a JSON array.' using errcode = '22023';
  end if;

  for entry in select value from jsonb_array_elements(input_entries)
  loop
    entry_id := null;
    if coalesce(entry ->> 'id', '') <> '' then
      entry_id := (entry ->> 'id')::uuid;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_loading_qty := coalesce((entry ->> 'loadingQty')::integer, 0);
    entry_sales_qty := coalesce((entry ->> 'salesQty')::integer, 0);
    entry_lorry_qty := coalesce((entry ->> 'lorryQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each loading item must include a product.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Loading, sales, and lorry quantities must be non-negative selling units.' using errcode = '23514';
    end if;

    if entry_sales_qty > entry_loading_qty then
      raise exception 'Sales quantity cannot exceed loading quantity.' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.products p
      where p.id = entry_product_id
        and p.organization_id = org_id
        and p.is_active = true
    ) then
      raise exception 'Selected product does not belong to this organization or is inactive.' using errcode = '23503';
    end if;

    if report_row.loading_completed_at is null then
      if entry_sales_qty > 0 or entry_lorry_qty > 0 then
        raise exception 'Sales and lorry quantities can only be recorded after morning loading is finalized.' using errcode = 'P0001';
      end if;
    else
      if entry_id is null then
        raise exception 'Morning loading rows are locked after finalize. Save against existing rows only.' using errcode = 'P0001';
      end if;

      if not exists (
        select 1
        from public.report_inventory_entries rie
        where rie.id = entry_id
          and rie.daily_report_id = target_daily_report_id
          and rie.product_id = entry_product_id
          and rie.loading_qty = entry_loading_qty
      ) then
        raise exception 'Product selection and loading quantity are locked after morning finalize.' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  if report_row.loading_completed_at is null then
    delete from public.report_inventory_entries
    where daily_report_id = target_daily_report_id;

    for entry in select value from jsonb_array_elements(input_entries)
    loop
      insert into public.report_inventory_entries (
        id,
        daily_report_id,
        product_id,
        product_code_snapshot,
        product_name_snapshot,
        product_display_name_snapshot,
        brand_snapshot,
        product_family_snapshot,
        variant_snapshot,
        unit_size_snapshot,
        unit_measure_snapshot,
        pack_size_snapshot,
        selling_unit_snapshot,
        quantity_entry_mode_snapshot,
        unit_price_snapshot,
        distributor_price_snapshot,
        loading_qty,
        sales_qty,
        lorry_qty,
        sales_revenue_snapshot,
        costed_sales_qty_snapshot
      )
      select
        coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
        target_daily_report_id,
        p.id,
        p.product_code,
        p.product_name,
        coalesce(p.display_name, p.product_name),
        p.brand,
        p.product_family,
        p.variant,
        p.unit_size,
        p.unit_measure,
        p.pack_size,
        p.selling_unit,
        p.quantity_entry_mode,
        p.unit_price,
        coalesce(p.distributor_price, 0),
        coalesce((entry ->> 'loadingQty')::integer, 0),
        0,
        0,
        0,
        0
      from public.products p
      where p.id = (entry ->> 'productId')::uuid;
    end loop;
  else
    select count(*)
    into existing_count
    from public.report_inventory_entries
    where daily_report_id = target_daily_report_id;

    if existing_count <> jsonb_array_length(input_entries) then
      raise exception 'Morning loading rows are locked after finalize. Do not add or remove rows during reconciliation.' using errcode = 'P0001';
    end if;

    for entry in select value from jsonb_array_elements(input_entries)
    loop
      update public.report_inventory_entries
      set
        sales_qty = coalesce((entry ->> 'salesQty')::integer, 0),
        lorry_qty = coalesce((entry ->> 'lorryQty')::integer, 0),
        sales_revenue_snapshot = round(coalesce((entry ->> 'salesQty')::integer, 0) * unit_price_snapshot, 2),
        costed_sales_qty_snapshot = coalesce((entry ->> 'salesQty')::integer, 0),
        updated_at = timezone('utc', now())
      where id = (entry ->> 'id')::uuid
        and daily_report_id = target_daily_report_id;
    end loop;
  end if;

  perform public.recalculate_daily_report_totals(target_daily_report_id);

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

grant execute on function public.save_loading_summary_items(uuid, jsonb) to authenticated;

comment on function public.save_loading_summary_items(uuid, jsonb) is
  'Saves route-day stock movement rows using selling-unit quantities. Morning stage can change products/loading; after finalize only sales and lorry counts can change.';

commit;
