begin;

alter table public.products
  add column if not exists brand text,
  add column if not exists product_family text,
  add column if not exists variant text,
  add column if not exists unit_size numeric(12,3),
  add column if not exists unit_measure text,
  add column if not exists pack_size integer,
  add column if not exists selling_unit text,
  add column if not exists display_name text;

update public.products
set product_family = coalesce(
  nullif(trim(product_family), ''),
  nullif(trim(product_name), ''),
  nullif(trim(name), ''),
  'General'
)
where product_family is null
   or nullif(trim(product_family), '') is null;

update public.products
set display_name = coalesce(
  nullif(trim(display_name), ''),
  nullif(trim(product_name), ''),
  nullif(trim(name), ''),
  product_family
)
where display_name is null
   or nullif(trim(display_name), '') is null;

alter table public.products
  alter column product_family set not null,
  alter column category drop not null;

alter table public.products
  drop constraint if exists products_unit_size_check,
  drop constraint if exists products_pack_size_check;

alter table public.products
  add constraint products_unit_size_check check (unit_size is null or unit_size > 0),
  add constraint products_pack_size_check check (pack_size is null or pack_size > 0);

comment on column public.products.brand is 'Optional commercial brand attached to the sellable SKU.';
comment on column public.products.product_family is 'Primary structured family or base product name used for SKU grouping.';
comment on column public.products.variant is 'Optional flavor, fat level, size line, or other SKU variant label.';
comment on column public.products.unit_size is 'Optional contained unit size for one inner item, such as 180 or 50.';
comment on column public.products.unit_measure is 'Optional measurement label paired with unit_size, such as ml or g.';
comment on column public.products.pack_size is 'Optional count of inner items in the sellable pack, case, or tray.';
comment on column public.products.selling_unit is 'Optional sellable unit label such as pack, crate, tray, or carton.';
comment on column public.products.display_name is 'Preferred structured display label for UI and operational sheets during the SKU transition.';

commit;
