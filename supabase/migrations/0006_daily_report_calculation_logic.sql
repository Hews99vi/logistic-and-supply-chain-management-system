begin;

-- ---------------------------------------------------------------------------
-- Reusable calculation functions.
-- Generated columns on child tables already use equivalent database-side math.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_day_sale_total(
  total_cash numeric,
  total_cheques numeric,
  total_credit numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(total_cash, 0) + coalesce(total_cheques, 0) + coalesce(total_credit, 0), 2);
$$;

create or replace function public.calculate_cash_book_total(
  cash_in_hand numeric,
  cash_in_bank numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(cash_in_hand, 0) + coalesce(cash_in_bank, 0), 2);
$$;

create or replace function public.calculate_cash_difference(
  cash_physical_total numeric,
  cash_book_total numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(cash_physical_total, 0) - coalesce(cash_book_total, 0), 2);
$$;

create or replace function public.calculate_db_margin_value(
  total_sale numeric,
  db_margin_percent numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(total_sale, 0) * (coalesce(db_margin_percent, 0) / 100.0), 2);
$$;

create or replace function public.calculate_net_profit(
  total_sale numeric,
  db_margin_percent numeric,
  total_expenses numeric
)
returns numeric
language sql
immutable
as $$
  select round(
    public.calculate_db_margin_value(total_sale, db_margin_percent) - coalesce(total_expenses, 0),
    2
  );
$$;

create or replace function public.calculate_denomination_line_total(
  denomination_value numeric,
  note_count integer
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(denomination_value, 0) * coalesce(note_count, 0), 2);
$$;

create or replace function public.calculate_inventory_balance_qty(
  loading_qty integer,
  sales_qty integer
)
returns integer
language sql
immutable
as $$
  select coalesce(loading_qty, 0) - coalesce(sales_qty, 0);
$$;

create or replace function public.calculate_inventory_variance_qty(
  lorry_qty integer,
  loading_qty integer,
  sales_qty integer
)
returns integer
language sql
immutable
as $$
  select coalesce(lorry_qty, 0) - public.calculate_inventory_balance_qty(loading_qty, sales_qty);
$$;

create or replace function public.calculate_return_line_value(
  qty integer,
  unit_price_snapshot numeric
)
returns numeric
language sql
immutable
as $$
  select round(coalesce(qty, 0) * coalesce(unit_price_snapshot, 0), 2);
$$;

comment on function public.calculate_day_sale_total(numeric, numeric, numeric) is 'Calculates day sale from cash, cheque, and credit invoice totals.';
comment on function public.calculate_cash_book_total(numeric, numeric) is 'Calculates cash book total from cash in hand and cash in bank.';
comment on function public.calculate_cash_difference(numeric, numeric) is 'Calculates signed difference between physical cash and cash book total.';
comment on function public.calculate_db_margin_value(numeric, numeric) is 'Calculates DB margin value from total sale and margin percent.';
comment on function public.calculate_net_profit(numeric, numeric, numeric) is 'Calculates net profit from margin value less total expenses.';
comment on function public.calculate_denomination_line_total(numeric, integer) is 'Calculates a denomination line total.';
comment on function public.calculate_inventory_balance_qty(integer, integer) is 'Calculates expected inventory balance quantity.';
comment on function public.calculate_inventory_variance_qty(integer, integer, integer) is 'Calculates inventory variance quantity.';
comment on function public.calculate_return_line_value(integer, numeric) is 'Calculates return or damage line value.';

-- ---------------------------------------------------------------------------
-- Parent report rollup helper.
-- ---------------------------------------------------------------------------
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

  select
    public.calculate_cash_book_total(dr.cash_in_hand, dr.cash_in_bank),
    public.calculate_db_margin_value(dr.total_sale, dr.db_margin_percent),
    public.calculate_net_profit(dr.total_sale, dr.db_margin_percent, expense_total)
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

comment on function public.recalculate_daily_report_totals(uuid) is 'Recomputes all stored daily report totals from child tables and parent financial inputs.';

-- ---------------------------------------------------------------------------
-- Shared trigger wrappers.
-- ---------------------------------------------------------------------------
create or replace function public.trigger_recalculate_daily_report_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case when tg_op = 'DELETE' then old.daily_report_id else new.daily_report_id end;
  perform public.recalculate_daily_report_totals(target_report_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.trigger_recalculate_current_daily_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_daily_report_totals(new.id);
  return new;
end;
$$;

comment on function public.trigger_recalculate_daily_report_totals() is 'Trigger wrapper for child records that affect daily report rollups.';
comment on function public.trigger_recalculate_current_daily_report() is 'Trigger wrapper for direct daily report financial input changes.';

-- ---------------------------------------------------------------------------
-- Trigger bindings for child-table rollups.
-- ---------------------------------------------------------------------------
drop trigger if exists recalculate_daily_reports_from_invoice_entries on public.report_invoice_entries;
create trigger recalculate_daily_reports_from_invoice_entries
after insert or update or delete on public.report_invoice_entries
for each row execute procedure public.trigger_recalculate_daily_report_totals();

drop trigger if exists recalculate_daily_reports_from_expenses on public.report_expenses;
create trigger recalculate_daily_reports_from_expenses
after insert or update or delete on public.report_expenses
for each row execute procedure public.trigger_recalculate_daily_report_totals();

drop trigger if exists recalculate_daily_reports_from_denominations on public.report_cash_denominations;
create trigger recalculate_daily_reports_from_denominations
after insert or update or delete on public.report_cash_denominations
for each row execute procedure public.trigger_recalculate_daily_report_totals();

-- ---------------------------------------------------------------------------
-- Trigger bindings for parent-field driven recalculations.
-- ---------------------------------------------------------------------------
drop trigger if exists recalculate_daily_reports_from_parent_fields on public.daily_reports;
create trigger recalculate_daily_reports_from_parent_fields
after insert or update of cash_in_hand, cash_in_bank, total_sale, db_margin_percent
on public.daily_reports
for each row execute procedure public.trigger_recalculate_current_daily_report();

commit;
