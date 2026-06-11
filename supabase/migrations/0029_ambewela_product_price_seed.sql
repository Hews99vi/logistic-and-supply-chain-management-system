begin;

alter table public.products enable row level security;

alter table public.products
  add column if not exists distributor_price numeric(12,2) not null default 0;

alter table public.products
  drop constraint if exists products_distributor_price_check;

alter table public.products
  add constraint products_distributor_price_check
  check (distributor_price >= 0);

-- Seed/update the product catalog from the supplied Ambewela product price list.
-- The app uses products.unit_price as the editable source of truth for report
-- calculations, so admins can adjust these rates later from Product Management.
with price_list (
  product_code,
  product_name,
  unit_price,
  distributor_price,
  category,
  brand,
  product_family,
  variant,
  unit_size,
  unit_measure,
  pack_size,
  selling_unit,
  quantity_entry_mode
) as (
  values
    ('16', 'Ambewela Yoghurt 80mlx48', 65.46, 60.56, 'YOGURT', 'Ambewela', 'Ambewela Yoghurt', null, 80, 'ml', 48, 'pack', 'unit'),
    ('78', 'Ambewela Yoghurt (Faluda) 80mlx48', 65.46, 60.56, 'YOGURT', 'Ambewela', 'Ambewela Yoghurt', 'Faluda', 80, 'ml', 48, 'pack', 'unit'),
    ('93', 'Ambewela Yoghurt (Mango) 80mlx48', 65.46, 60.56, 'YOGURT', 'Ambewela', 'Ambewela Yoghurt', 'Mango', 80, 'ml', 48, 'pack', 'unit'),
    ('82', 'Ambewela Yoghurt Tub - 450ml x 12', 0.00, 0.00, 'YOGURT', 'Ambewela', 'Ambewela Yoghurt Tub', null, 450, 'ml', 12, 'pack', 'unit'),
    ('84', 'Ambewela Yoghurt Tub - 900ml x 06', 0.00, 0.00, 'YOGURT', 'Ambewela', 'Ambewela Yoghurt Tub', null, 900, 'ml', 6, 'pack', 'unit'),
    ('71', 'Amb Drinking Yoghurt (Vanilla) 180ml X 24', 148.75, 139.83, 'YOGURT', 'Ambewela', 'Amb Drinking Yoghurt', 'Vanilla', 180, 'ml', 24, 'pack', 'unit'),
    ('73', 'Amb Drinking Yoghurt (Strawberry) 180ml X 24', 148.75, 139.83, 'YOGURT', 'Ambewela', 'Amb Drinking Yoghurt', 'Strawberry', 180, 'ml', 24, 'pack', 'unit'),
    ('56', 'Ambewela Butter Slab 200gx12', 996.00, 896.40, 'BUTTER', 'Ambewela', 'Ambewela Butter Slab', null, 200, 'g', 12, 'pack', 'unit'),
    ('3024', 'Ambewela FM 1000mlx12', 495.00, 475.20, 'MILK', 'Ambewela', 'Ambewela Fresh Milk', null, 1000, 'ml', 12, 'pack', 'unit'),
    ('49', 'Ambewela Fresh Milk 450mlx20', 191.40, 183.74, 'MILK', 'Ambewela', 'Ambewela Fresh Milk', null, 450, 'ml', 20, 'pack', 'unit'),
    ('3026', 'Ambewela FM 200mlx24', 126.00, 0.00, 'MILK', 'Ambewela', 'Ambewela Fresh Milk', null, 200, 'ml', 24, 'pack', 'unit'),
    ('3104', 'Ambewela FM 200mlx24', 0.00, 0.00, 'MILK', 'Ambewela', 'Ambewela Fresh Milk', null, 200, 'ml', 24, 'pack', 'unit'),
    ('3106', 'Suddi Fm 1000ml x12', 0.00, 0.00, 'MILK', 'Suddi', 'Suddi Fresh Milk', null, 1000, 'ml', 12, 'pack', 'unit'),
    ('47', 'Ambewela Pouch Chocolate 150mlx28', 84.00, 80.64, 'MILK', 'Ambewela', 'Ambewela Pouch', 'Chocolate', 150, 'ml', 28, 'pack', 'unit'),
    ('48', 'Ambewela Pouch Vanilla 150mlx28', 84.00, 80.64, 'MILK', 'Ambewela', 'Ambewela Pouch', 'Vanilla', 150, 'ml', 28, 'pack', 'unit'),
    ('3078', 'Ambewela Chocolate 180mlx24', 126.00, 120.96, 'MILK', 'Ambewela', 'Ambewela Flavoured Milk', 'Chocolate', 180, 'ml', 24, 'pack', 'unit'),
    ('3080', 'Ambewela Vanilla 180mlx24', 126.00, 120.96, 'MILK', 'Ambewela', 'Ambewela Flavoured Milk', 'Vanilla', 180, 'ml', 24, 'pack', 'unit'),
    ('1085', 'Lakspray Sachet 18gx420', 0.00, 0.00, 'OTHER', 'Lakspray', 'Lakspray Sachet', null, 18, 'g', 420, 'pack', 'unit'),
    ('1064', 'Lakspray Sachet 50gx120', 0.00, 0.00, 'OTHER', 'Lakspray', 'Lakspray Sachet', null, 50, 'g', 120, 'pack', 'unit'),
    ('1077', 'Lakspray Sachet 200gx36', 0.00, 0.00, 'OTHER', 'Lakspray', 'Lakspray Sachet', null, 200, 'g', 36, 'pack', 'unit'),
    ('1004', 'Lakspray Sachet 400gx24', 0.00, 0.00, 'OTHER', 'Lakspray', 'Lakspray Sachet', null, 400, 'g', 24, 'pack', 'unit'),
    ('5037', 'My Juicee Apple 180mlx24', 110.50, 106.07, 'OTHER', 'My Juicee', 'My Juicee', 'Apple', 180, 'ml', 24, 'pack', 'unit'),
    ('5039', 'My Juicee Mango 180mlx24', 110.50, 106.07, 'OTHER', 'My Juicee', 'My Juicee', 'Mango', 180, 'ml', 24, 'pack', 'unit'),
    ('5043', 'My Juicee Orange 180mlx24', 110.50, 106.07, 'OTHER', 'My Juicee', 'My Juicee', 'Orange', 180, 'ml', 24, 'pack', 'unit'),
    ('5041', 'My Juicee Mixed Fruit 180mlx24', 110.50, 106.07, 'OTHER', 'My Juicee', 'My Juicee', 'Mixed Fruit', 180, 'ml', 24, 'pack', 'unit')
),
updated_products as (
  update public.products p
  set
    product_code = price_list.product_code,
    product_name = price_list.product_name,
    name = price_list.product_name,
    sku = coalesce(nullif(trim(p.sku), ''), price_list.product_code),
    category = price_list.category,
    unit_price = price_list.unit_price,
    base_price = price_list.unit_price,
    distributor_price = price_list.distributor_price,
    brand = price_list.brand,
    product_family = price_list.product_family,
    variant = price_list.variant,
    unit_size = price_list.unit_size,
    unit_measure = price_list.unit_measure,
    pack_size = price_list.pack_size,
    selling_unit = price_list.selling_unit,
    quantity_entry_mode = price_list.quantity_entry_mode,
    display_name = price_list.product_name,
    unit_of_measure = 'UNIT',
    is_active = true
  from price_list
  where nullif(ltrim(p.product_code, '0'), '') = price_list.product_code
  returning price_list.product_code
),
target_organization as (
  select id
  from public.organizations
  order by created_at asc
  limit 1
)
insert into public.products (
  organization_id,
  product_code,
  product_name,
  name,
  sku,
  category,
  unit_price,
  base_price,
  distributor_price,
  brand,
  product_family,
  variant,
  unit_size,
  unit_measure,
  pack_size,
  selling_unit,
  quantity_entry_mode,
  display_name,
  unit_of_measure,
  cold_chain_required,
  is_active
)
select
  target_organization.id,
  price_list.product_code,
  price_list.product_name,
  price_list.product_name,
  price_list.product_code,
  price_list.category,
  price_list.unit_price,
  price_list.unit_price,
  price_list.distributor_price,
  price_list.brand,
  price_list.product_family,
  price_list.variant,
  price_list.unit_size,
  price_list.unit_measure,
  price_list.pack_size,
  price_list.selling_unit,
  price_list.quantity_entry_mode,
  price_list.product_name,
  'UNIT',
  price_list.category in ('MILK', 'YOGURT', 'CHEESE', 'BUTTER', 'ICE_CREAM'),
  true
from price_list
cross join target_organization
where not exists (
  select 1
  from updated_products
  where updated_products.product_code = price_list.product_code
)
and not exists (
  select 1
  from public.products p
  where nullif(ltrim(p.product_code, '0'), '') = price_list.product_code
);

commit;
