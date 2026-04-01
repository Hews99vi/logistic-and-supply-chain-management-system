begin;

alter table public.report_inventory_entries
  add column if not exists product_display_name_snapshot text,
  add column if not exists brand_snapshot text,
  add column if not exists product_family_snapshot text,
  add column if not exists variant_snapshot text,
  add column if not exists unit_size_snapshot numeric,
  add column if not exists unit_measure_snapshot text,
  add column if not exists pack_size_snapshot integer,
  add column if not exists selling_unit_snapshot text;

alter table public.report_return_damage_entries
  add column if not exists product_display_name_snapshot text,
  add column if not exists brand_snapshot text,
  add column if not exists product_family_snapshot text,
  add column if not exists variant_snapshot text,
  add column if not exists unit_size_snapshot numeric,
  add column if not exists unit_measure_snapshot text,
  add column if not exists pack_size_snapshot integer,
  add column if not exists selling_unit_snapshot text;

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
  new.product_display_name_snapshot := coalesce(source_product.display_name, source_product.product_name);
  new.brand_snapshot := source_product.brand;
  new.product_family_snapshot := source_product.product_family;
  new.variant_snapshot := source_product.variant;
  new.unit_size_snapshot := source_product.unit_size;
  new.unit_measure_snapshot := source_product.unit_measure;
  new.pack_size_snapshot := source_product.pack_size;
  new.selling_unit_snapshot := source_product.selling_unit;
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_inventory_entry_snapshot() is 'Hydrates inventory snapshot fields, including structured SKU fields, from the selected product before write.';

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
  new.product_display_name_snapshot := coalesce(source_product.display_name, source_product.product_name);
  new.brand_snapshot := source_product.brand;
  new.product_family_snapshot := source_product.product_family;
  new.variant_snapshot := source_product.variant;
  new.unit_size_snapshot := source_product.unit_size;
  new.unit_measure_snapshot := source_product.unit_measure;
  new.pack_size_snapshot := source_product.pack_size;
  new.selling_unit_snapshot := source_product.selling_unit;
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_return_damage_entry_snapshot() is 'Hydrates return and damage snapshot fields, including structured SKU fields, from the selected product before write.';

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries disable trigger guard_report_return_damage_entry_mutations;

update public.report_inventory_entries rie
set product_display_name_snapshot = coalesce(rie.product_display_name_snapshot, p.display_name, p.product_name),
    brand_snapshot = coalesce(rie.brand_snapshot, p.brand),
    product_family_snapshot = coalesce(rie.product_family_snapshot, p.product_family),
    variant_snapshot = coalesce(rie.variant_snapshot, p.variant),
    unit_size_snapshot = coalesce(rie.unit_size_snapshot, p.unit_size),
    unit_measure_snapshot = coalesce(rie.unit_measure_snapshot, p.unit_measure),
    pack_size_snapshot = coalesce(rie.pack_size_snapshot, p.pack_size),
    selling_unit_snapshot = coalesce(rie.selling_unit_snapshot, p.selling_unit)
from public.products p
where p.id = rie.product_id;

update public.report_return_damage_entries rrde
set product_display_name_snapshot = coalesce(rrde.product_display_name_snapshot, p.display_name, p.product_name),
    brand_snapshot = coalesce(rrde.brand_snapshot, p.brand),
    product_family_snapshot = coalesce(rrde.product_family_snapshot, p.product_family),
    variant_snapshot = coalesce(rrde.variant_snapshot, p.variant),
    unit_size_snapshot = coalesce(rrde.unit_size_snapshot, p.unit_size),
    unit_measure_snapshot = coalesce(rrde.unit_measure_snapshot, p.unit_measure),
    pack_size_snapshot = coalesce(rrde.pack_size_snapshot, p.pack_size),
    selling_unit_snapshot = coalesce(rrde.selling_unit_snapshot, p.selling_unit)
from public.products p
where p.id = rrde.product_id;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries enable trigger guard_report_return_damage_entry_mutations;

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
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is 'Atomically replaces a report inventory set with one row per product and auto-filled legacy plus structured product snapshots.';

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

comment on function public.save_report_return_damage_entries(uuid, jsonb) is 'Atomically replaces a report return and damage set with auto-filled legacy plus structured product snapshots and generated qty/value.';

commit;

