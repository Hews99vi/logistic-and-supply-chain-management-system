begin;

with category_seed(category_name) as (
  values
    ('Fuel'),
    ('Vehicle Maintenance'),
    ('Driver Allowance'),
    ('Helper Allowance'),
    ('Meals / Refreshments'),
    ('Tolls / Parking'),
    ('Loading / Unloading'),
    ('Repairs'),
    ('Communication'),
    ('Other Route Expense')
),
updated_categories as (
  update public.expense_categories ec
  set
    is_system = true,
    is_active = true,
    updated_at = timezone('utc', now())
  from category_seed
  where lower(ec.category_name) = lower(category_seed.category_name)
  returning lower(ec.category_name) as normalized_name
)
insert into public.expense_categories (
  category_name,
  is_system,
  is_active
)
select
  category_seed.category_name,
  true,
  true
from category_seed
where not exists (
  select 1
  from updated_categories
  where updated_categories.normalized_name = lower(category_seed.category_name)
);

commit;
