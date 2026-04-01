begin;

create or replace function public.dashboard_total_sales(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(dr.total_sale), 0)::numeric(14,2)
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id);
$$;

create or replace function public.dashboard_total_expenses(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(dr.total_expenses), 0)::numeric(14,2)
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id);
$$;

create or replace function public.dashboard_net_profit(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(dr.net_profit), 0)::numeric(14,2)
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id);
$$;

create or replace function public.dashboard_report_count_by_status(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns table(status text, report_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select dr.status, count(*)::bigint as report_count
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by dr.status
  order by dr.status;
$$;

create or replace function public.dashboard_sales_by_route(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns table(
  route_program_id uuid,
  route_name text,
  territory_name text,
  report_count bigint,
  total_sales numeric,
  total_cash numeric,
  total_expenses numeric,
  total_net_profit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dr.route_program_id,
    max(dr.route_name_snapshot) as route_name,
    max(dr.territory_name_snapshot) as territory_name,
    count(*)::bigint as report_count,
    coalesce(sum(dr.total_sale), 0)::numeric(14,2) as total_sales,
    coalesce(sum(dr.total_cash), 0)::numeric(14,2) as total_cash,
    coalesce(sum(dr.total_expenses), 0)::numeric(14,2) as total_expenses,
    coalesce(sum(dr.net_profit), 0)::numeric(14,2) as total_net_profit
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by dr.route_program_id
  order by total_sales desc, territory_name asc, route_name asc;
$$;

create or replace function public.dashboard_top_products_by_sales_quantity(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null,
  top_n integer default 10
)
returns table(
  product_id uuid,
  product_code text,
  product_name text,
  total_sales_qty bigint,
  total_balance_qty bigint,
  total_variance_qty bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rie.product_id,
    max(rie.product_code_snapshot) as product_code,
    max(rie.product_name_snapshot) as product_name,
    coalesce(sum(rie.sales_qty), 0)::bigint as total_sales_qty,
    coalesce(sum(rie.balance_qty), 0)::bigint as total_balance_qty,
    coalesce(sum(rie.variance_qty), 0)::bigint as total_variance_qty
  from public.report_inventory_entries rie
  join public.daily_reports dr on dr.id = rie.daily_report_id
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by rie.product_id
  order by total_sales_qty desc, product_name asc
  limit greatest(coalesce(top_n, 10), 1);
$$;

create or replace function public.dashboard_most_returned_products(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null,
  top_n integer default 10
)
returns table(
  product_id uuid,
  product_code text,
  product_name text,
  total_return_qty bigint,
  total_damage_qty bigint,
  total_free_issue_qty bigint,
  total_affected_qty bigint,
  total_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rrde.product_id,
    max(rrde.product_code_snapshot) as product_code,
    max(rrde.product_name_snapshot) as product_name,
    coalesce(sum(rrde.return_qty), 0)::bigint as total_return_qty,
    coalesce(sum(rrde.damage_qty), 0)::bigint as total_damage_qty,
    coalesce(sum(rrde.free_issue_qty), 0)::bigint as total_free_issue_qty,
    coalesce(sum(rrde.qty), 0)::bigint as total_affected_qty,
    coalesce(sum(rrde.value), 0)::numeric(14,2) as total_value
  from public.report_return_damage_entries rrde
  join public.daily_reports dr on dr.id = rrde.daily_report_id
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by rrde.product_id
  order by total_return_qty desc, total_affected_qty desc, product_name asc
  limit greatest(coalesce(top_n, 10), 1);
$$;

create or replace function public.dashboard_daily_trend_summary(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns table(
  report_date date,
  report_count bigint,
  total_sales numeric,
  total_expenses numeric,
  total_net_profit numeric,
  total_cash numeric,
  total_cheques numeric,
  total_credit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dr.report_date,
    count(*)::bigint as report_count,
    coalesce(sum(dr.total_sale), 0)::numeric(14,2) as total_sales,
    coalesce(sum(dr.total_expenses), 0)::numeric(14,2) as total_expenses,
    coalesce(sum(dr.net_profit), 0)::numeric(14,2) as total_net_profit,
    coalesce(sum(dr.total_cash), 0)::numeric(14,2) as total_cash,
    coalesce(sum(dr.total_cheques), 0)::numeric(14,2) as total_cheques,
    coalesce(sum(dr.total_credit), 0)::numeric(14,2) as total_credit
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by dr.report_date
  order by dr.report_date asc;
$$;

create or replace function public.dashboard_payment_mode_totals(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns table(
  total_cash numeric,
  total_cheques numeric,
  total_credit numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(dr.total_cash), 0)::numeric(14,2) as total_cash,
    coalesce(sum(dr.total_cheques), 0)::numeric(14,2) as total_cheques,
    coalesce(sum(dr.total_credit), 0)::numeric(14,2) as total_credit
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id);
$$;

create or replace function public.dashboard_route_performance_summary(
  date_from date default null,
  date_to date default null,
  target_route_program_id uuid default null
)
returns table(
  route_program_id uuid,
  route_name text,
  territory_name text,
  report_count bigint,
  total_sales numeric,
  total_expenses numeric,
  total_net_profit numeric,
  average_sales_per_report numeric,
  average_expense_per_report numeric,
  average_net_profit_per_report numeric,
  total_cash_difference numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dr.route_program_id,
    max(dr.route_name_snapshot) as route_name,
    max(dr.territory_name_snapshot) as territory_name,
    count(*)::bigint as report_count,
    coalesce(sum(dr.total_sale), 0)::numeric(14,2) as total_sales,
    coalesce(sum(dr.total_expenses), 0)::numeric(14,2) as total_expenses,
    coalesce(sum(dr.net_profit), 0)::numeric(14,2) as total_net_profit,
    coalesce(avg(dr.total_sale), 0)::numeric(14,2) as average_sales_per_report,
    coalesce(avg(dr.total_expenses), 0)::numeric(14,2) as average_expense_per_report,
    coalesce(avg(dr.net_profit), 0)::numeric(14,2) as average_net_profit_per_report,
    coalesce(sum(dr.cash_difference), 0)::numeric(14,2) as total_cash_difference
  from public.daily_reports dr
  where dr.deleted_at is null
    and (date_from is null or dr.report_date >= date_from)
    and (date_to is null or dr.report_date <= date_to)
    and (target_route_program_id is null or dr.route_program_id = target_route_program_id)
  group by dr.route_program_id
  order by total_net_profit desc, territory_name asc, route_name asc;
$$;

grant execute on function public.dashboard_total_sales(date, date, uuid) to authenticated;
grant execute on function public.dashboard_total_expenses(date, date, uuid) to authenticated;
grant execute on function public.dashboard_net_profit(date, date, uuid) to authenticated;
grant execute on function public.dashboard_report_count_by_status(date, date, uuid) to authenticated;
grant execute on function public.dashboard_sales_by_route(date, date, uuid) to authenticated;
grant execute on function public.dashboard_top_products_by_sales_quantity(date, date, uuid, integer) to authenticated;
grant execute on function public.dashboard_most_returned_products(date, date, uuid, integer) to authenticated;
grant execute on function public.dashboard_daily_trend_summary(date, date, uuid) to authenticated;
grant execute on function public.dashboard_payment_mode_totals(date, date, uuid) to authenticated;
grant execute on function public.dashboard_route_performance_summary(date, date, uuid) to authenticated;

commit;