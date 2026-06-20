begin;

-- Complete finance workflow upgrade.
-- This layer keeps the existing DATE report as the route-day source record and
-- adds detailed ledgers for cash adjustments, cheques, credit, bills, approved
-- expenses, and driver payroll.

alter table public.daily_reports
  add column if not exists finance_completed_at timestamptz,
  add column if not exists finance_completed_by uuid references public.profiles(id) on delete set null;

alter table public.report_expenses
  add column if not exists payment_method text not null default 'cash',
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists receipt_file_path text,
  add column if not exists receipt_file_name text,
  add column if not exists status text not null default 'draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.report_expenses
  drop constraint if exists report_expenses_payment_method_check,
  add constraint report_expenses_payment_method_check check (payment_method in ('cash', 'cheque', 'bank', 'credit', 'other'));

alter table public.report_expenses
  drop constraint if exists report_expenses_status_check,
  add constraint report_expenses_status_check check (status in ('draft', 'submitted', 'approved', 'rejected', 'void'));

update public.report_expenses
set status = 'approved',
    approved_at = coalesce(approved_at, created_at)
where status = 'draft';

create table if not exists public.report_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('shortage', 'excess')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'void')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.report_cheques (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  invoice_entry_id uuid references public.report_invoice_entries(id) on delete set null,
  invoice_no text,
  customer_name text,
  cheque_no text not null,
  bank_name text not null,
  branch_name text,
  cheque_date date,
  received_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'received' check (status in ('received', 'deposited', 'realized', 'bounced', 'returned', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (daily_report_id, cheque_no, bank_name)
);

create table if not exists public.customer_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  normalized_customer_name text generated always as (lower(trim(customer_name))) stored,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, normalized_customer_name)
);

create table if not exists public.credit_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  daily_report_id uuid references public.daily_reports(id) on delete set null,
  invoice_entry_id uuid references public.report_invoice_entries(id) on delete set null,
  credit_account_id uuid references public.customer_credit_accounts(id) on delete restrict,
  invoice_no text not null,
  customer_name text not null,
  invoice_date date not null default current_date,
  due_date date,
  amount numeric(14,2) not null check (amount > 0),
  collected_amount numeric(14,2) not null default 0 check (collected_amount >= 0),
  outstanding_amount numeric(14,2) generated always as (round(amount - collected_amount, 2)) stored,
  status text not null default 'open' check (status in ('open', 'partially_paid', 'settled', 'written_off', 'disputed')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, invoice_no)
);

create table if not exists public.credit_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_invoice_id uuid not null references public.credit_invoices(id) on delete cascade,
  collected_at date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'cheque', 'bank', 'other')),
  reference_no text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.report_bills (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  invoice_entry_id uuid references public.report_invoice_entries(id) on delete set null,
  invoice_no text not null,
  customer_name text,
  amount_snapshot numeric(14,2) not null default 0 check (amount_snapshot >= 0),
  status text not null default 'delivered' check (status in ('delivered', 'cancelled', 'returned', 'missing', 'disputed')),
  exception_approved_by uuid references public.profiles(id) on delete set null,
  exception_approved_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (daily_report_id, invoice_no)
);

create table if not exists public.driver_salary_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  base_salary numeric(14,2) not null default 0 check (base_salary >= 0),
  default_allowance numeric(14,2) not null default 0 check (default_allowance >= 0),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.driver_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'paid', 'void')),
  gross_salary numeric(14,2) not null default 0,
  allowances numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  advances numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  balance_payable numeric(14,2) generated always as (round(net_payable - paid_amount, 2)) stored,
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_payroll_period_valid_check check (period_end >= period_start),
  unique (organization_id, driver_id, period_start, period_end)
);

create table if not exists public.driver_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.driver_payroll_periods(id) on delete cascade,
  source_deduction_id uuid references public.driver_deductions(id) on delete set null,
  line_type text not null check (line_type in ('salary', 'allowance', 'deduction', 'advance', 'adjustment')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.driver_salary_payments (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.driver_payroll_periods(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'cheque', 'bank', 'other')),
  reference_no text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_report_cash_adjustments_updated_at on public.report_cash_adjustments;
create trigger set_report_cash_adjustments_updated_at
before update on public.report_cash_adjustments
for each row execute procedure public.set_updated_at();

drop trigger if exists set_report_cheques_updated_at on public.report_cheques;
create trigger set_report_cheques_updated_at
before update on public.report_cheques
for each row execute procedure public.set_updated_at();

drop trigger if exists set_customer_credit_accounts_updated_at on public.customer_credit_accounts;
create trigger set_customer_credit_accounts_updated_at
before update on public.customer_credit_accounts
for each row execute procedure public.set_updated_at();

drop trigger if exists set_credit_invoices_updated_at on public.credit_invoices;
create trigger set_credit_invoices_updated_at
before update on public.credit_invoices
for each row execute procedure public.set_updated_at();

drop trigger if exists set_report_bills_updated_at on public.report_bills;
create trigger set_report_bills_updated_at
before update on public.report_bills
for each row execute procedure public.set_updated_at();

drop trigger if exists set_driver_salary_profiles_updated_at on public.driver_salary_profiles;
create trigger set_driver_salary_profiles_updated_at
before update on public.driver_salary_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_driver_payroll_periods_updated_at on public.driver_payroll_periods;
create trigger set_driver_payroll_periods_updated_at
before update on public.driver_payroll_periods
for each row execute procedure public.set_updated_at();

create or replace function public.finance_report_organization_id(target_report_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select rp.organization_id
  from public.daily_reports dr
  join public.route_programs rp on rp.id = dr.route_program_id
  where dr.id = target_report_id;
$$;

create or replace function public.finance_can_view_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_view_daily_report(target_report_id);
$$;

create or replace function public.finance_can_edit_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_finance_report(target_report_id);
$$;

create or replace function public.finance_can_approve_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_feature_permission('daily_reports', 'approve', public.finance_report_organization_id(target_report_id));
$$;

alter table public.report_cash_adjustments enable row level security;
alter table public.report_cheques enable row level security;
alter table public.customer_credit_accounts enable row level security;
alter table public.credit_invoices enable row level security;
alter table public.credit_collections enable row level security;
alter table public.report_bills enable row level security;
alter table public.driver_salary_profiles enable row level security;
alter table public.driver_payroll_periods enable row level security;
alter table public.driver_payroll_lines enable row level security;
alter table public.driver_salary_payments enable row level security;

drop policy if exists report_cash_adjustments_select_policy on public.report_cash_adjustments;
create policy report_cash_adjustments_select_policy on public.report_cash_adjustments
for select to authenticated using (public.finance_can_view_report(daily_report_id));
drop policy if exists report_cash_adjustments_write_policy on public.report_cash_adjustments;
create policy report_cash_adjustments_write_policy on public.report_cash_adjustments
for all to authenticated using (public.finance_can_edit_report(daily_report_id) or public.finance_can_approve_report(daily_report_id))
with check (public.finance_can_edit_report(daily_report_id) or public.finance_can_approve_report(daily_report_id));

drop policy if exists report_cheques_select_policy on public.report_cheques;
create policy report_cheques_select_policy on public.report_cheques
for select to authenticated using (public.finance_can_view_report(daily_report_id));
drop policy if exists report_cheques_write_policy on public.report_cheques;
create policy report_cheques_write_policy on public.report_cheques
for all to authenticated using (public.finance_can_edit_report(daily_report_id))
with check (public.finance_can_edit_report(daily_report_id));

drop policy if exists report_bills_select_policy on public.report_bills;
create policy report_bills_select_policy on public.report_bills
for select to authenticated using (public.finance_can_view_report(daily_report_id));
drop policy if exists report_bills_write_policy on public.report_bills;
create policy report_bills_write_policy on public.report_bills
for all to authenticated using (public.finance_can_edit_report(daily_report_id) or public.finance_can_approve_report(daily_report_id))
with check (public.finance_can_edit_report(daily_report_id) or public.finance_can_approve_report(daily_report_id));

drop policy if exists customer_credit_accounts_select_policy on public.customer_credit_accounts;
create policy customer_credit_accounts_select_policy on public.customer_credit_accounts
for select to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'view', organization_id));
drop policy if exists customer_credit_accounts_write_policy on public.customer_credit_accounts;
create policy customer_credit_accounts_write_policy on public.customer_credit_accounts
for all to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id))
with check (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id));

drop policy if exists credit_invoices_select_policy on public.credit_invoices;
create policy credit_invoices_select_policy on public.credit_invoices
for select to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'view', organization_id));
drop policy if exists credit_invoices_write_policy on public.credit_invoices;
create policy credit_invoices_write_policy on public.credit_invoices
for all to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id))
with check (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id));

drop policy if exists credit_collections_select_policy on public.credit_collections;
create policy credit_collections_select_policy on public.credit_collections
for select to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'view', organization_id));
drop policy if exists credit_collections_write_policy on public.credit_collections;
create policy credit_collections_write_policy on public.credit_collections
for all to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id))
with check (public.user_has_org_access(organization_id) and public.user_has_feature_permission('date_sheet', 'edit', organization_id));

drop policy if exists driver_salary_profiles_select_policy on public.driver_salary_profiles;
create policy driver_salary_profiles_select_policy on public.driver_salary_profiles
for select to authenticated using (public.user_has_org_access(organization_id) and (driver_id = auth.uid() or public.user_has_feature_permission('daily_reports', 'approve', organization_id)));
drop policy if exists driver_salary_profiles_write_policy on public.driver_salary_profiles;
create policy driver_salary_profiles_write_policy on public.driver_salary_profiles
for all to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('daily_reports', 'approve', organization_id))
with check (public.user_has_org_access(organization_id) and public.user_has_feature_permission('daily_reports', 'approve', organization_id));

drop policy if exists driver_payroll_periods_select_policy on public.driver_payroll_periods;
create policy driver_payroll_periods_select_policy on public.driver_payroll_periods
for select to authenticated using (public.user_has_org_access(organization_id) and (driver_id = auth.uid() or public.user_has_feature_permission('daily_reports', 'approve', organization_id)));
drop policy if exists driver_payroll_periods_write_policy on public.driver_payroll_periods;
create policy driver_payroll_periods_write_policy on public.driver_payroll_periods
for all to authenticated using (public.user_has_org_access(organization_id) and public.user_has_feature_permission('daily_reports', 'approve', organization_id))
with check (public.user_has_org_access(organization_id) and public.user_has_feature_permission('daily_reports', 'approve', organization_id));

drop policy if exists driver_payroll_lines_select_policy on public.driver_payroll_lines;
create policy driver_payroll_lines_select_policy on public.driver_payroll_lines
for select to authenticated using (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and (dpp.driver_id = auth.uid() or public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id))
  )
);
drop policy if exists driver_payroll_lines_write_policy on public.driver_payroll_lines;
create policy driver_payroll_lines_write_policy on public.driver_payroll_lines
for all to authenticated using (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id)
  )
)
with check (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id)
  )
);

drop policy if exists driver_salary_payments_select_policy on public.driver_salary_payments;
create policy driver_salary_payments_select_policy on public.driver_salary_payments
for select to authenticated using (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and (dpp.driver_id = auth.uid() or public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id))
  )
);
drop policy if exists driver_salary_payments_write_policy on public.driver_salary_payments;
create policy driver_salary_payments_write_policy on public.driver_salary_payments
for all to authenticated using (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id)
  )
)
with check (
  exists (
    select 1 from public.driver_payroll_periods dpp
    where dpp.id = payroll_period_id
      and public.user_has_org_access(dpp.organization_id)
      and public.user_has_feature_permission('daily_reports', 'approve', dpp.organization_id)
  )
);

create or replace function public.sync_finance_ledgers_for_report(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  item record;
  v_account_id uuid;
begin
  select public.finance_report_organization_id(target_daily_report_id) into v_org_id;

  if v_org_id is null then
    raise exception 'Report organization was not found.' using errcode = 'P0002';
  end if;

  insert into public.report_bills (
    daily_report_id,
    invoice_entry_id,
    invoice_no,
    amount_snapshot,
    status
  )
  select
    rie.daily_report_id,
    rie.id,
    rie.invoice_no,
    round(coalesce(rie.cash_amount, 0) + coalesce(rie.cheque_amount, 0) + coalesce(rie.credit_amount, 0), 2),
    'delivered'
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_daily_report_id
  on conflict (daily_report_id, invoice_no)
  do update set
    invoice_entry_id = excluded.invoice_entry_id,
    amount_snapshot = excluded.amount_snapshot,
    updated_at = timezone('utc', now());

  for item in
    select *
    from public.report_invoice_entries rie
    where rie.daily_report_id = target_daily_report_id
      and rie.credit_amount > 0
  loop
    insert into public.customer_credit_accounts (
      organization_id,
      customer_name
    ) values (
      v_org_id,
      coalesce(nullif(trim(item.notes), ''), 'Unknown Credit Customer')
    )
    on conflict (organization_id, normalized_customer_name)
    do update set updated_at = timezone('utc', now())
    returning id into v_account_id;

    insert into public.credit_invoices (
      organization_id,
      daily_report_id,
      invoice_entry_id,
      credit_account_id,
      invoice_no,
      customer_name,
      invoice_date,
      amount,
      collected_amount,
      status
    ) values (
      v_org_id,
      target_daily_report_id,
      item.id,
      v_account_id,
      item.invoice_no,
      coalesce(nullif(trim(item.notes), ''), 'Unknown Credit Customer'),
      current_date,
      item.credit_amount,
      0,
      'open'
    )
    on conflict (organization_id, invoice_no)
    do update set
      daily_report_id = excluded.daily_report_id,
      invoice_entry_id = excluded.invoice_entry_id,
      credit_account_id = excluded.credit_account_id,
      customer_name = excluded.customer_name,
      amount = excluded.amount,
      status = case
        when public.credit_invoices.collected_amount >= excluded.amount then 'settled'
        when public.credit_invoices.collected_amount > 0 then 'partially_paid'
        else 'open'
      end,
      updated_at = timezone('utc', now());
  end loop;
end;
$$;

create or replace function public.recalculate_credit_invoice(target_credit_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  collected numeric(14,2);
  invoice_amount numeric(14,2);
begin
  select coalesce(sum(amount), 0)
  into collected
  from public.credit_collections
  where credit_invoice_id = target_credit_invoice_id;

  select amount
  into invoice_amount
  from public.credit_invoices
  where id = target_credit_invoice_id;

  update public.credit_invoices
  set
    collected_amount = least(collected, invoice_amount),
    status = case
      when least(collected, invoice_amount) >= invoice_amount then 'settled'
      when collected > 0 then 'partially_paid'
      else status
    end,
    updated_at = timezone('utc', now())
  where id = target_credit_invoice_id;
end;
$$;

create or replace function public.trigger_recalculate_credit_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.credit_invoice_id else new.credit_invoice_id end;
  perform public.recalculate_credit_invoice(target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists recalculate_credit_invoice_from_collections on public.credit_collections;
create trigger recalculate_credit_invoice_from_collections
after insert or update or delete on public.credit_collections
for each row execute procedure public.trigger_recalculate_credit_invoice();

create or replace function public.recalculate_daily_report_totals(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_totals record;
  approved_expense_total numeric(14,2) := 0;
  cash_physical numeric(14,2) := 0;
  approved_adjustment_total numeric(14,2) := 0;
  distributor_gross_profit numeric(14,2) := 0;
  day_sale numeric(14,2) := 0;
begin
  select
    coalesce(sum(cash_amount), 0) as cash_total,
    coalesce(sum(cheque_amount), 0) as cheque_total,
    coalesce(sum(credit_amount), 0) as credit_total
  into invoice_totals
  from public.report_invoice_entries
  where daily_report_id = target_daily_report_id;

  day_sale := coalesce(invoice_totals.cash_total, 0)
    + coalesce(invoice_totals.cheque_total, 0)
    + coalesce(invoice_totals.credit_total, 0);

  select coalesce(sum(amount), 0)
  into approved_expense_total
  from public.report_expenses
  where daily_report_id = target_daily_report_id
    and status = 'approved';

  select coalesce(sum(line_total), 0)
  into cash_physical
  from public.report_cash_denominations
  where daily_report_id = target_daily_report_id;

  -- A shortage approval explains missing cash, so it adds back to the
  -- handover side of the reconciliation. An excess approval explains extra
  -- cash, so it reduces the handover side for comparison to expected cash.
  select coalesce(sum(case adjustment_type when 'shortage' then amount else -amount end), 0)
  into approved_adjustment_total
  from public.report_cash_adjustments
  where daily_report_id = target_daily_report_id
    and status = 'approved';

  select coalesce(sum(gross_profit_snapshot), 0)
  into distributor_gross_profit
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id;

  update public.daily_reports
  set
    total_cash = coalesce(invoice_totals.cash_total, 0),
    total_cheques = coalesce(invoice_totals.cheque_total, 0),
    total_credit = coalesce(invoice_totals.credit_total, 0),
    total_expenses = coalesce(approved_expense_total, 0),
    day_sale_total = day_sale,
    total_sale = day_sale,
    db_margin_value = public.calculate_db_margin_value(day_sale, db_margin_percent),
    net_profit = round(coalesce(distributor_gross_profit, 0) - coalesce(approved_expense_total, 0), 2),
    cash_book_total = round(coalesce(cash_physical, 0) + coalesce(cash_in_bank, 0) + coalesce(approved_adjustment_total, 0), 2),
    cash_physical_total = coalesce(cash_physical, 0),
    cash_in_hand = coalesce(cash_physical, 0),
    cash_difference = round(coalesce(cash_physical, 0) + coalesce(cash_in_bank, 0) + coalesce(approved_adjustment_total, 0) - coalesce(invoice_totals.cash_total, 0), 2)
  where id = target_daily_report_id;
end;
$$;

create or replace function public.trigger_recalculate_daily_report_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  target_report_id := case when tg_op = 'DELETE' then old.daily_report_id else new.daily_report_id end;
  perform public.recalculate_daily_report_totals(target_report_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists recalculate_daily_reports_from_cash_adjustments on public.report_cash_adjustments;
create trigger recalculate_daily_reports_from_cash_adjustments
after insert or update or delete on public.report_cash_adjustments
for each row execute procedure public.trigger_recalculate_daily_report_totals();

create or replace function public.approve_report_expense(target_expense_id uuid, target_status text, resolution_reason text default null)
returns public.report_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  expense_row public.report_expenses%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into expense_row
  from public.report_expenses
  where id = target_expense_id
  for update;

  if not found then
    raise exception 'Expense not found.' using errcode = 'P0002';
  end if;

  if target_status not in ('approved', 'rejected', 'void') then
    raise exception 'Expense status must be approved, rejected, or void.' using errcode = '23514';
  end if;

  if not public.finance_can_approve_report(expense_row.daily_report_id) then
    raise exception 'Missing permission to approve expenses.' using errcode = '42501';
  end if;

  update public.report_expenses
  set
    status = target_status,
    approved_by = case when target_status = 'approved' then actor_id else approved_by end,
    approved_at = case when target_status = 'approved' then timezone('utc', now()) else approved_at end,
    rejected_by = case when target_status = 'rejected' then actor_id else rejected_by end,
    rejected_at = case when target_status = 'rejected' then timezone('utc', now()) else rejected_at end,
    rejection_reason = case when target_status = 'rejected' then nullif(trim(resolution_reason), '') else rejection_reason end
  where id = target_expense_id
  returning * into expense_row;

  perform public.recalculate_daily_report_totals(expense_row.daily_report_id);
  return expense_row;
end;
$$;

create or replace function public.resolve_report_cash_adjustment(target_adjustment_id uuid, target_status text)
returns public.report_cash_adjustments
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  adjustment_row public.report_cash_adjustments%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into adjustment_row
  from public.report_cash_adjustments
  where id = target_adjustment_id
  for update;

  if not found then
    raise exception 'Cash adjustment not found.' using errcode = 'P0002';
  end if;

  if target_status not in ('approved', 'rejected', 'void') then
    raise exception 'Cash adjustment status must be approved, rejected, or void.' using errcode = '23514';
  end if;

  if not public.finance_can_approve_report(adjustment_row.daily_report_id) then
    raise exception 'Missing permission to approve cash adjustments.' using errcode = '42501';
  end if;

  update public.report_cash_adjustments
  set
    status = target_status,
    approved_by = case when target_status = 'approved' then actor_id else approved_by end,
    approved_at = case when target_status = 'approved' then timezone('utc', now()) else approved_at end
  where id = target_adjustment_id
  returning * into adjustment_row;

  perform public.recalculate_daily_report_totals(adjustment_row.daily_report_id);
  return adjustment_row;
end;
$$;

create or replace function public.approve_report_bill_exception(target_bill_id uuid)
returns public.report_bills
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  bill_row public.report_bills%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into bill_row
  from public.report_bills
  where id = target_bill_id
  for update;

  if not found then
    raise exception 'Bill record not found.' using errcode = 'P0002';
  end if;

  if bill_row.status not in ('missing', 'disputed') then
    raise exception 'Only missing or disputed bill records require exception approval.' using errcode = '23514';
  end if;

  if not public.finance_can_approve_report(bill_row.daily_report_id) then
    raise exception 'Missing permission to approve bill exceptions.' using errcode = '42501';
  end if;

  update public.report_bills
  set
    exception_approved_by = actor_id,
    exception_approved_at = timezone('utc', now())
  where id = target_bill_id
  returning * into bill_row;

  return bill_row;
end;
$$;

create or replace function public.finalize_driver_payroll_period(target_period_id uuid)
returns public.driver_payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  period_row public.driver_payroll_periods%rowtype;
  salary_profile public.driver_salary_profiles%rowtype;
  deduction_total numeric(14,2) := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into period_row
  from public.driver_payroll_periods
  where id = target_period_id
  for update;

  if not found then
    raise exception 'Payroll period not found.' using errcode = 'P0002';
  end if;

  if period_row.status <> 'draft' then
    raise exception 'Only draft payroll periods can be finalized.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('daily_reports', 'approve', period_row.organization_id) then
    raise exception 'Missing permission to finalize payroll.' using errcode = '42501';
  end if;

  select *
  into salary_profile
  from public.driver_salary_profiles dsp
  where dsp.organization_id = period_row.organization_id
    and dsp.driver_id = period_row.driver_id
    and dsp.is_active = true
    and dsp.effective_from <= period_row.period_end
    and (dsp.effective_to is null or dsp.effective_to >= period_row.period_start)
  order by dsp.effective_from desc
  limit 1;

  delete from public.driver_payroll_lines
  where payroll_period_id = target_period_id;

  insert into public.driver_payroll_lines (payroll_period_id, line_type, description, amount)
  values
    (target_period_id, 'salary', 'Base salary', coalesce(salary_profile.base_salary, 0)),
    (target_period_id, 'allowance', 'Default allowance', coalesce(salary_profile.default_allowance, 0));

  insert into public.driver_payroll_lines (
    payroll_period_id,
    source_deduction_id,
    line_type,
    description,
    amount
  )
  select
    target_period_id,
    dd.id,
    'deduction',
    'Missing stock deduction: ' || dd.product_name_snapshot,
    dd.deduction_amount
  from public.driver_deductions dd
  join public.daily_reports dr on dr.id = dd.daily_report_id
  where dd.driver_id = period_row.driver_id
    and dd.status = 'approved'
    and dr.report_date between period_row.period_start and period_row.period_end;

  select coalesce(sum(amount), 0)
  into deduction_total
  from public.driver_payroll_lines
  where payroll_period_id = target_period_id
    and line_type = 'deduction';

  update public.driver_payroll_periods
  set
    gross_salary = coalesce(salary_profile.base_salary, 0),
    allowances = coalesce(salary_profile.default_allowance, 0),
    deductions = deduction_total,
    net_payable = round(coalesce(salary_profile.base_salary, 0) + coalesce(salary_profile.default_allowance, 0) - deduction_total - advances, 2),
    status = 'finalized',
    finalized_by = actor_id,
    finalized_at = timezone('utc', now())
  where id = target_period_id
  returning * into period_row;

  update public.driver_deductions dd
  set status = 'settled',
      settled_at = timezone('utc', now())
  where dd.id in (
    select source_deduction_id
    from public.driver_payroll_lines
    where payroll_period_id = target_period_id
      and source_deduction_id is not null
  );

  return period_row;
end;
$$;

create or replace function public.submit_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
  v_org_id uuid;
  invoice_entry_count bigint := 0;
  inventory_entry_count bigint := 0;
  invalid_inventory_count bigint := 0;
  unresolved_missing_count bigint := 0;
  positive_variance_count bigint := 0;
  positive_denomination_count bigint := 0;
  pending_expense_count bigint := 0;
  unresolved_bill_count bigint := 0;
  bill_count bigint := 0;
  cheque_detail_total numeric(14,2) := 0;
  credit_detail_total numeric(14,2) := 0;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.finance_report_organization_id(target_report_id) into v_org_id;

  if not public.user_has_feature_permission('date_sheet', 'submit', v_org_id) then
    raise exception 'Missing permission to submit DATE reports.' using errcode = '42501';
  end if;

  if current_report.status <> 'draft' then
    raise exception 'Only draft reports can be submitted.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and current_report.prepared_by <> actor_id then
    raise exception 'Drivers can only submit their own reports.' using errcode = '42501';
  end if;

  if current_report.loading_completed_at is null then
    raise exception 'Finalize the loading summary before submitting the DATE report.' using errcode = '23514';
  end if;

  perform public.sync_finance_ledgers_for_report(target_report_id);
  perform public.recalculate_daily_report_totals(target_report_id);

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id;

  select count(*) into inventory_entry_count
  from public.report_inventory_entries
  where daily_report_id = target_report_id;

  if inventory_entry_count = 0 then
    raise exception 'Add at least one inventory line before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into invalid_inventory_count
  from public.report_inventory_entries
  where daily_report_id = target_report_id
    and (sales_qty > loading_qty or lorry_qty < 0);

  if invalid_inventory_count > 0 then
    raise exception 'Inventory lines contain invalid quantities.' using errcode = '23514';
  end if;

  perform public.sync_driver_deductions_for_report(target_report_id);

  select count(*) into positive_variance_count
  from public.report_inventory_entries
  where daily_report_id = target_report_id
    and variance_qty > 0;

  if positive_variance_count > 0 then
    raise exception 'Positive more-stock variances must be reviewed and corrected before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into unresolved_missing_count
  from public.driver_deductions
  where daily_report_id = target_report_id
    and status = 'pending';

  if unresolved_missing_count > 0 then
    raise exception 'Missing lorry stock was found. Approve or waive the driver deduction before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into invoice_entry_count
  from public.report_invoice_entries
  where daily_report_id = target_report_id;

  if invoice_entry_count = 0 then
    raise exception 'Add at least one invoice entry before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into pending_expense_count
  from public.report_expenses
  where daily_report_id = target_report_id
    and status in ('draft', 'submitted');

  if pending_expense_count > 0 then
    raise exception 'Approve, reject, or void pending expenses before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into bill_count
  from public.report_bills
  where daily_report_id = target_report_id;

  if bill_count = 0 then
    raise exception 'Bill ledger must be generated before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*) into unresolved_bill_count
  from public.report_bills
  where daily_report_id = target_report_id
    and status in ('missing', 'disputed')
    and exception_approved_at is null;

  if unresolved_bill_count > 0 then
    raise exception 'Missing or disputed bills must be approved before submitting.' using errcode = '23514';
  end if;

  if current_report.total_bill_count <= 0 then
    raise exception 'Total bill count must be greater than zero before submitting the DATE report.' using errcode = '23514';
  end if;

  if bill_count <> current_report.total_bill_count then
    raise exception 'Bill ledger count must match total bill count before submit.' using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0) into cheque_detail_total
  from public.report_cheques
  where daily_report_id = target_report_id
    and status <> 'cancelled';

  if round(cheque_detail_total, 2) <> round(current_report.total_cheques, 2) then
    raise exception 'Cheque register total must match invoice cheque total before submit.' using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0) into credit_detail_total
  from public.credit_invoices
  where daily_report_id = target_report_id
    and status <> 'written_off';

  if round(credit_detail_total, 2) <> round(current_report.total_credit, 2) then
    raise exception 'Credit ledger total must match invoice credit total before submit.' using errcode = '23514';
  end if;

  if current_report.total_cash > 0 or current_report.cash_physical_total > 0 then
    select count(*) into positive_denomination_count
    from public.report_cash_denominations
    where daily_report_id = target_report_id
      and note_count > 0;

    if positive_denomination_count = 0 then
      raise exception 'Record denomination counts before submitting the DATE report.' using errcode = '23514';
    end if;

    if abs(coalesce(current_report.cash_difference, 0)) >= 0.01 then
      raise exception 'Cash handover must match expected invoice cash or have approved adjustments.' using errcode = '23514';
    end if;
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
    finance_completed_at = timezone('utc', now()),
    finance_completed_by = actor_id,
    approved_at = null,
    approved_by = null,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

create index if not exists report_cash_adjustments_report_status_idx on public.report_cash_adjustments (daily_report_id, status);
create index if not exists report_cheques_report_status_idx on public.report_cheques (daily_report_id, status);
create index if not exists report_bills_report_status_idx on public.report_bills (daily_report_id, status);
create index if not exists credit_invoices_org_status_idx on public.credit_invoices (organization_id, status);
create index if not exists credit_collections_invoice_idx on public.credit_collections (credit_invoice_id);
create index if not exists driver_payroll_periods_org_driver_idx on public.driver_payroll_periods (organization_id, driver_id, period_start, period_end);

grant execute on function public.sync_finance_ledgers_for_report(uuid) to authenticated;
grant execute on function public.approve_report_expense(uuid, text, text) to authenticated;
grant execute on function public.resolve_report_cash_adjustment(uuid, text) to authenticated;
grant execute on function public.approve_report_bill_exception(uuid) to authenticated;
grant execute on function public.finalize_driver_payroll_period(uuid) to authenticated;

comment on table public.report_cash_adjustments is 'Approved shortage/excess explanations used to reconcile expected invoice cash to handover cash.';
comment on table public.report_cheques is 'Full cheque register for route-day handover and later settlement lifecycle.';
comment on table public.customer_credit_accounts is 'Customer/outlet credit account master used by credit sales ledger.';
comment on table public.credit_invoices is 'Customer credit invoices created from route-day credit sales.';
comment on table public.report_bills is 'Physical bill ledger for delivered, cancelled, returned, missing, or disputed invoices.';
comment on table public.driver_payroll_periods is 'Driver salary/payroll periods with salary, allowance, deduction, payment, and balance totals.';
comment on function public.approve_report_bill_exception(uuid) is 'Approves a missing or disputed physical bill exception before route-day submission.';

commit;
