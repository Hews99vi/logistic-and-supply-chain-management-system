begin;

alter table public.products
  add column if not exists quantity_entry_mode text;

update public.products
set quantity_entry_mode = case
  when lower(coalesce(quantity_entry_mode, '')) in ('unit', 'pack') then lower(quantity_entry_mode)
  when lower(coalesce(selling_unit, '')) = 'unit' then 'unit'
  else 'pack'
end
where quantity_entry_mode is null
   or lower(coalesce(quantity_entry_mode, '')) not in ('unit', 'pack');

alter table public.products
  alter column quantity_entry_mode set default 'pack';

alter table public.products
  alter column quantity_entry_mode set not null;

alter table public.products
  drop constraint if exists products_quantity_entry_mode_check;

alter table public.products
  add constraint products_quantity_entry_mode_check
  check (quantity_entry_mode in ('pack', 'unit'));

alter table public.report_inventory_entries
  add column if not exists quantity_entry_mode_snapshot text;

alter table public.report_return_damage_entries
  add column if not exists quantity_entry_mode_snapshot text;

alter table public.report_inventory_entries
  drop constraint if exists report_inventory_entries_quantity_entry_mode_snapshot_check;

alter table public.report_inventory_entries
  add constraint report_inventory_entries_quantity_entry_mode_snapshot_check
  check (quantity_entry_mode_snapshot is null or quantity_entry_mode_snapshot in ('pack', 'unit'));

alter table public.report_return_damage_entries
  drop constraint if exists report_return_damage_entries_quantity_entry_mode_snapshot_check;

alter table public.report_return_damage_entries
  add constraint report_return_damage_entries_quantity_entry_mode_snapshot_check
  check (quantity_entry_mode_snapshot is null or quantity_entry_mode_snapshot in ('pack', 'unit'));

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
  new.quantity_entry_mode_snapshot := source_product.quantity_entry_mode;
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

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
  new.quantity_entry_mode_snapshot := source_product.quantity_entry_mode;
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries disable trigger guard_report_return_damage_entry_mutations;

update public.report_inventory_entries rie
set quantity_entry_mode_snapshot = coalesce(
      rie.quantity_entry_mode_snapshot,
      p.quantity_entry_mode,
      case when lower(coalesce(rie.selling_unit_snapshot, '')) = 'unit' then 'unit' else 'pack' end
    )
from public.products p
where p.id = rie.product_id;

update public.report_inventory_entries rie
set quantity_entry_mode_snapshot = case
      when lower(coalesce(rie.selling_unit_snapshot, '')) = 'unit' then 'unit'
      else 'pack'
    end
where rie.quantity_entry_mode_snapshot is null;

update public.report_return_damage_entries rrde
set quantity_entry_mode_snapshot = coalesce(
      rrde.quantity_entry_mode_snapshot,
      p.quantity_entry_mode,
      case when lower(coalesce(rrde.selling_unit_snapshot, '')) = 'unit' then 'unit' else 'pack' end
    )
from public.products p
where p.id = rrde.product_id;

update public.report_return_damage_entries rrde
set quantity_entry_mode_snapshot = case
      when lower(coalesce(rrde.selling_unit_snapshot, '')) = 'unit' then 'unit'
      else 'pack'
    end
where rrde.quantity_entry_mode_snapshot is null;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries enable trigger guard_report_return_damage_entry_mutations;

commit;
