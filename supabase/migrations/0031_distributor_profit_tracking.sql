begin;

alter table public.products
  add column if not exists distributor_price numeric(12,2) not null default 0;

alter table public.products
  drop constraint if exists products_distributor_price_check;

alter table public.products
  add constraint products_distributor_price_check
  check (distributor_price >= 0);

alter table public.report_inventory_entries
  add column if not exists distributor_price_snapshot numeric(12,2) not null default 0,
  add column if not exists sales_revenue_snapshot numeric(14,2) not null default 0;

alter table public.report_inventory_entries
  drop constraint if exists report_inventory_entries_distributor_price_snapshot_check;

alter table public.report_inventory_entries
  add constraint report_inventory_entries_distributor_price_snapshot_check
  check (distributor_price_snapshot >= 0);

alter table public.report_inventory_entries
  drop constraint if exists report_inventory_entries_sales_revenue_snapshot_check;

alter table public.report_inventory_entries
  add constraint report_inventory_entries_sales_revenue_snapshot_check
  check (sales_revenue_snapshot >= 0);

alter table public.report_inventory_entries
  drop column if exists gross_profit_snapshot;

alter table public.report_inventory_entries
  add column gross_profit_snapshot numeric(14,2)
  generated always as (
    round(coalesce(sales_revenue_snapshot, 0) - (coalesce(sales_qty, 0) * coalesce(distributor_price_snapshot, 0)), 2)
  ) stored;

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;

update public.report_inventory_entries rie
set
  distributor_price_snapshot = coalesce(p.distributor_price, 0),
  sales_revenue_snapshot = round(coalesce(rie.sales_qty, 0) * coalesce(rie.unit_price_snapshot, p.unit_price, 0), 2)
from public.products p
where p.id = rie.product_id;

update public.report_inventory_entries
set sales_revenue_snapshot = round(coalesce(sales_qty, 0) * coalesce(unit_price_snapshot, 0), 2)
where sales_revenue_snapshot = 0
  and coalesce(sales_qty, 0) > 0;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;

comment on column public.products.distributor_price is 'Distributor buying/cost price from the mother company. Admin-maintained.';
comment on column public.report_inventory_entries.distributor_price_snapshot is 'Distributor buying price copied from product at report entry creation/import time.';
comment on column public.report_inventory_entries.sales_revenue_snapshot is 'Actual product-level sales revenue, from imported CSV when available or sales quantity times system price.';
comment on column public.report_inventory_entries.gross_profit_snapshot is 'Distributor gross profit for this product: sales revenue less distributor cost for sold quantity.';

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
  new.distributor_price_snapshot := source_product.distributor_price;
  return new;
end;
$$;

drop trigger if exists populate_report_inventory_entry_snapshot on public.report_inventory_entries;
create trigger populate_report_inventory_entry_snapshot
before insert or update of product_id on public.report_inventory_entries
for each row execute procedure public.populate_report_inventory_entry_snapshot();

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
    entry_sales_revenue := case
      when entry ? 'salesRevenue' and nullif(entry ->> 'salesRevenue', '') is not null then (entry ->> 'salesRevenue')::numeric
      else null
    end;

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
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
      sales_revenue_snapshot
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
      entry_sales_revenue
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is 'Atomically replaces a report inventory set with one row per product and snapshots distributor cost plus product-level revenue.';

create or replace function public.calculate_distributor_net_profit(
  inventory_gross_profit numeric,
  total_expenses numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(inventory_gross_profit, 0) - coalesce(total_expenses, 0), 2);
$$;

comment on function public.calculate_distributor_net_profit(numeric, numeric) is 'Calculates actual distributor net profit from inventory gross profit less expenses.';

create or replace function public.recalculate_daily_report_totals(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_cash numeric(14,2) := 0;
  invoice_cheques numeric(14,2) := 0;
  invoice_credit numeric(14,2) := 0;
  expense_total numeric(14,2) := 0;
  denomination_total numeric(14,2) := 0;
  cash_book_total_value numeric(14,2) := 0;
  margin_value numeric(14,2) := 0;
  inventory_gross_profit numeric(14,2) := 0;
  net_profit_value numeric(14,2) := 0;
begin
  if target_daily_report_id is null then
    return;
  end if;

  select
    coalesce(sum(rie.cash_amount), 0),
    coalesce(sum(rie.cheque_amount), 0),
    coalesce(sum(rie.credit_amount), 0)
  into
    invoice_cash,
    invoice_cheques,
    invoice_credit
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_daily_report_id;

  select coalesce(sum(re.amount), 0)
  into expense_total
  from public.report_expenses re
  where re.daily_report_id = target_daily_report_id;

  select coalesce(sum(rcd.line_total), 0)
  into denomination_total
  from public.report_cash_denominations rcd
  where rcd.daily_report_id = target_daily_report_id;

  select coalesce(sum(rie.gross_profit_snapshot), 0)
  into inventory_gross_profit
  from public.report_inventory_entries rie
  where rie.daily_report_id = target_daily_report_id;

  select
    public.calculate_cash_book_total(dr.cash_in_hand, dr.cash_in_bank),
    public.calculate_db_margin_value(dr.total_sale, dr.db_margin_percent),
    public.calculate_distributor_net_profit(inventory_gross_profit, expense_total)
  into
    cash_book_total_value,
    margin_value,
    net_profit_value
  from public.daily_reports dr
  where dr.id = target_daily_report_id
  for update;

  update public.daily_reports dr
  set
    total_cash = invoice_cash,
    total_cheques = invoice_cheques,
    total_credit = invoice_credit,
    total_expenses = expense_total,
    day_sale_total = public.calculate_day_sale_total(invoice_cash, invoice_cheques, invoice_credit),
    cash_physical_total = denomination_total,
    cash_book_total = cash_book_total_value,
    cash_difference = public.calculate_cash_difference(denomination_total, cash_book_total_value),
    db_margin_value = margin_value,
    net_profit = net_profit_value
  where dr.id = target_daily_report_id;
end;
$$;

comment on function public.recalculate_daily_report_totals(uuid) is 'Recomputes daily report totals, with net_profit based on distributor-cost inventory gross profit less expenses.';

drop trigger if exists recalculate_daily_reports_from_inventory_entries on public.report_inventory_entries;
create trigger recalculate_daily_reports_from_inventory_entries
after insert or update or delete on public.report_inventory_entries
for each row execute procedure public.trigger_recalculate_daily_report_totals();

do $$
declare
  report_id uuid;
begin
  for report_id in
    select id from public.daily_reports where deleted_at is null
  loop
    perform public.recalculate_daily_report_totals(report_id);
  end loop;
end;
$$;

commit;
