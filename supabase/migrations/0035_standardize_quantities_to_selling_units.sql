begin;

-- Align operational quantities with the Ambewela Flat Data convention:
-- quantities are individual selling units, while pack_size remains packaging metadata.
update public.products
set
  quantity_entry_mode = 'unit',
  updated_at = timezone('utc', now())
where is_active = true
  and quantity_entry_mode <> 'unit';

alter table public.report_inventory_entries
  add column if not exists costed_sales_qty_snapshot integer not null default 0;

alter table public.report_inventory_entries
  drop constraint if exists report_inventory_entries_costed_sales_qty_snapshot_check;

alter table public.report_inventory_entries
  add constraint report_inventory_entries_costed_sales_qty_snapshot_check
  check (
    costed_sales_qty_snapshot >= 0
    and costed_sales_qty_snapshot <= sales_qty
  );

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;

update public.report_inventory_entries
set costed_sales_qty_snapshot = coalesce(sales_qty, 0)
where costed_sales_qty_snapshot = 0
  and coalesce(sales_qty, 0) > 0;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;

alter table public.report_inventory_entries
  drop column if exists gross_profit_snapshot;

alter table public.report_inventory_entries
  add column gross_profit_snapshot numeric(14,2)
  generated always as (
    round(coalesce(sales_revenue_snapshot, 0) - (coalesce(costed_sales_qty_snapshot, 0) * coalesce(distributor_price_snapshot, 0)), 2)
  ) stored;

comment on column public.report_inventory_entries.costed_sales_qty_snapshot is
  'Sold quantity that should carry distributor cost for profit. Imported free-issue/full-discount rows remain in sales_qty but are excluded here.';

comment on column public.report_inventory_entries.gross_profit_snapshot is
  'Distributor gross profit: sales revenue less distributor cost for costed sold quantity.';

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
  entry_costed_sales_qty integer;
  entry_sales_revenue numeric(14,2);
  entry_unit_price numeric(12,2);
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
    entry_costed_sales_qty := case
      when entry ? 'costedSalesQty' and nullif(entry ->> 'costedSalesQty', '') is not null then (entry ->> 'costedSalesQty')::integer
      else entry_sales_qty
    end;
    entry_sales_revenue := case
      when entry ? 'salesRevenue' and nullif(entry ->> 'salesRevenue', '') is not null then (entry ->> 'salesRevenue')::numeric
      else null
    end;

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 or entry_costed_sales_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_costed_sales_qty > entry_sales_qty then
      raise exception 'costedSalesQty cannot exceed salesQty.' using errcode = '23514';
    end if;

    if entry_sales_revenue is not null and entry_sales_revenue < 0 then
      raise exception 'Inventory sales revenue must be non-negative.' using errcode = '23514';
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
    select p.unit_price
    into entry_unit_price
    from public.products p
    where p.id = (entry ->> 'productId')::uuid
      and p.is_active = true;

    entry_sales_qty := coalesce((entry ->> 'salesQty')::integer, 0);
    entry_costed_sales_qty := case
      when entry ? 'costedSalesQty' and nullif(entry ->> 'costedSalesQty', '') is not null then (entry ->> 'costedSalesQty')::integer
      else entry_sales_qty
    end;
    entry_sales_revenue := case
      when entry ? 'salesRevenue' and nullif(entry ->> 'salesRevenue', '') is not null then (entry ->> 'salesRevenue')::numeric
      else round(entry_sales_qty * coalesce(entry_unit_price, 0), 2)
    end;

    insert into public.report_inventory_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      loading_qty,
      sales_qty,
      lorry_qty,
      sales_revenue_snapshot,
      costed_sales_qty_snapshot
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      coalesce((entry ->> 'loadingQty')::integer, 0),
      entry_sales_qty,
      coalesce((entry ->> 'lorryQty')::integer, 0),
      entry_sales_revenue,
      entry_costed_sales_qty
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is
  'Atomically replaces a report inventory set with unit quantities, product-level revenue, and distributor-costed sales quantity.';

commit;
