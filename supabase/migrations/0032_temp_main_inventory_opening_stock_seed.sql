begin;

-- TEMPORARY TEST DATA ONLY.
-- Sets every active product's main inventory opening stock to exactly 2000 units
-- so the full loading, sales, return, handover, and approval workflow can be tested.
with target_stock as (
  select
    p.organization_id,
    p.id as product_id,
    coalesce(mi.quantity, 0) as current_quantity,
    2000 - coalesce(mi.quantity, 0) as quantity_change
  from public.products p
  left join public.main_inventory mi
    on mi.organization_id = p.organization_id
   and mi.product_id = p.id
  where p.is_active = true
),
upserted_inventory as (
  insert into public.main_inventory (
    organization_id,
    product_id,
    quantity
  )
  select
    target_stock.organization_id,
    target_stock.product_id,
    2000
  from target_stock
  on conflict (organization_id, product_id)
  do update set
    quantity = excluded.quantity,
    updated_at = timezone('utc', now())
  returning organization_id, product_id
)
insert into public.inventory_transactions (
  organization_id,
  product_id,
  quantity_change,
  transaction_type,
  notes
)
select
  target_stock.organization_id,
  target_stock.product_id,
  target_stock.quantity_change,
  'ADJUSTMENT',
  'TEMP TEST SEED: set opening main stock to 2000 units'
from target_stock
join upserted_inventory
  on upserted_inventory.organization_id = target_stock.organization_id
 and upserted_inventory.product_id = target_stock.product_id
where target_stock.quantity_change <> 0;

commit;
