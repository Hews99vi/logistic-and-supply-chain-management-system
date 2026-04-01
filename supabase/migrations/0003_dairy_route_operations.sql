-- Dairy route operation tracking schema
-- This migration extends the base auth/profile/product model with route programs,
-- daily operational reporting, financial capture, inventory reconciliation,
-- and return/damage tracking.

begin;

-- Ensure the shared updated_at trigger function exists.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: extend the existing auth-linked user profile with operational roles.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text,
  add column if not exists is_active boolean not null default true;

update public.profiles
set role = coalesce(role, 'driver')
where role is null;

alter table public.profiles
  alter column role set default 'driver',
  alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'supervisor', 'driver', 'cashier'));

comment on table public.profiles is 'Application users mapped to Supabase Auth identities.';
comment on column public.profiles.role is 'Operational access role: admin, supervisor, driver, or cashier.';
comment on column public.profiles.is_active is 'Soft deactivation flag for application access.';

-- ---------------------------------------------------------------------------
-- Products: extend the existing catalog to support dairy route operations.
-- Existing columns are preserved for backward compatibility with the scaffold.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists product_code text,
  add column if not exists product_name text,
  add column if not exists unit_price numeric(12,2),
  add column if not exists is_active boolean not null default true;

update public.products
set product_code = coalesce(product_code, nullif(sku, ''), 'PRD-' || upper(substr(id::text, 1, 8)))
where product_code is null;

update public.products
set product_name = coalesce(product_name, name)
where product_name is null;

update public.products
set unit_price = coalesce(unit_price, base_price)
where unit_price is null;

alter table public.products
  alter column product_code set not null,
  alter column product_name set not null,
  alter column unit_price set not null,
  alter column sku drop not null;

alter table public.products
  drop constraint if exists products_unit_price_check;

alter table public.products
  add constraint products_unit_price_check
  check (unit_price >= 0);

comment on table public.products is 'Product catalog used by route operations and sales reporting.';
comment on column public.products.product_code is 'Business-facing product code used on route and invoice sheets.';
comment on column public.products.product_name is 'Display product name snapshot source for reports.';
comment on column public.products.unit_price is 'Current unit selling price used for route calculations.';

create unique index if not exists products_product_code_uidx on public.products (product_code);
create unique index if not exists products_sku_uidx on public.products (sku) where sku is not null;

-- ---------------------------------------------------------------------------
-- Route programs define planned route execution patterns.
-- ---------------------------------------------------------------------------
create table if not exists public.route_programs (
  id uuid primary key default gen_random_uuid(),
  territory_name text not null,
  day_of_week smallint not null,
  frequency_label text not null,
  route_name text not null,
  route_description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint route_programs_day_of_week_check check (day_of_week between 1 and 7),
  constraint route_programs_business_key unique (territory_name, day_of_week, route_name)
);

comment on table public.route_programs is 'Planned route programs by territory, weekday, and recurrence pattern.';
comment on column public.route_programs.day_of_week is 'ISO-style weekday number: 1 Monday through 7 Sunday.';

-- ---------------------------------------------------------------------------
-- Expense categories support both fixed system values and operationally added ones.
-- ---------------------------------------------------------------------------
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  category_name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.expense_categories is 'Reference data for expense entry classification.';
comment on column public.expense_categories.is_system is 'Marks seeded categories protected from casual deletion in the app layer.';

create unique index if not exists expense_categories_category_name_uidx
  on public.expense_categories (lower(category_name));

-- ---------------------------------------------------------------------------
-- Daily reports capture the route-level operational and financial summary.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  route_program_id uuid not null references public.route_programs(id) on delete restrict,
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  staff_name text not null,
  territory_name_snapshot text not null,
  route_name_snapshot text not null,
  status text not null default 'draft',
  remarks text,
  total_cash numeric(14,2) not null default 0,
  total_cheques numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  day_sale_total numeric(14,2) not null default 0,
  total_sale numeric(14,2) not null default 0,
  db_margin_percent numeric(7,2) not null default 0,
  db_margin_value numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  cash_in_hand numeric(14,2) not null default 0,
  cash_in_bank numeric(14,2) not null default 0,
  cash_book_total numeric(14,2) not null default 0,
  cash_physical_total numeric(14,2) not null default 0,
  cash_difference numeric(14,2) not null default 0,
  total_bill_count integer not null default 0,
  delivered_bill_count integer not null default 0,
  cancelled_bill_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_reports_status_check check (status in ('draft', 'submitted', 'approved', 'rejected')),
  constraint daily_reports_nonnegative_financials_check check (
    total_cash >= 0 and
    total_cheques >= 0 and
    total_credit >= 0 and
    total_expenses >= 0 and
    day_sale_total >= 0 and
    total_sale >= 0 and
    cash_in_hand >= 0 and
    cash_in_bank >= 0 and
    cash_book_total >= 0 and
    cash_physical_total >= 0
  ),
  constraint daily_reports_nonnegative_counts_check check (
    total_bill_count >= 0 and
    delivered_bill_count >= 0 and
    cancelled_bill_count >= 0
  ),
  constraint daily_reports_bill_counts_consistency_check check (
    delivered_bill_count + cancelled_bill_count <= total_bill_count
  ),
  constraint daily_reports_margin_percent_check check (
    db_margin_percent between -100 and 100
  ),
  constraint daily_reports_unique_route_day unique (report_date, route_program_id)
);

comment on table public.daily_reports is 'One operational report per route program per report date.';
comment on column public.daily_reports.territory_name_snapshot is 'Snapshot of territory name at the time of report creation.';
comment on column public.daily_reports.route_name_snapshot is 'Snapshot of route name at the time of report creation.';
comment on column public.daily_reports.cash_difference is 'Signed difference between cash_book_total and cash_physical_total.';

-- ---------------------------------------------------------------------------
-- Invoice allocations by payment mode.
-- ---------------------------------------------------------------------------
create table if not exists public.report_invoice_entries (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  line_no integer not null,
  invoice_no text not null,
  cash_amount numeric(14,2) not null default 0,
  cheque_amount numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint report_invoice_entries_line_no_check check (line_no > 0),
  constraint report_invoice_entries_nonnegative_check check (
    cash_amount >= 0 and cheque_amount >= 0 and credit_amount >= 0
  ),
  constraint report_invoice_entries_amount_presence_check check (
    cash_amount + cheque_amount + credit_amount > 0
  ),
  constraint report_invoice_entries_unique_line unique (daily_report_id, line_no),
  constraint report_invoice_entries_unique_invoice unique (daily_report_id, invoice_no)
);

comment on table public.report_invoice_entries is 'Per-invoice collection distribution across cash, cheque, and credit.';

-- ---------------------------------------------------------------------------
-- Expense lines belonging to a daily report.
-- ---------------------------------------------------------------------------
create table if not exists public.report_expenses (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  line_no integer not null,
  expense_category_id uuid references public.expense_categories(id) on delete restrict,
  custom_expense_name text,
  amount numeric(14,2) not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint report_expenses_line_no_check check (line_no > 0),
  constraint report_expenses_amount_check check (amount >= 0),
  constraint report_expenses_name_source_check check (
    expense_category_id is not null or nullif(trim(custom_expense_name), '') is not null
  ),
  constraint report_expenses_unique_line unique (daily_report_id, line_no)
);

comment on table public.report_expenses is 'Expense capture for route execution such as fuel, helper payments, or ad hoc costs.';

-- ---------------------------------------------------------------------------
-- Cash denomination count per report.
-- ---------------------------------------------------------------------------
create table if not exists public.report_cash_denominations (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  denomination_value numeric(12,2) not null,
  note_count integer not null,
  line_total numeric(14,2) generated always as (denomination_value * note_count) stored,
  created_at timestamptz not null default timezone('utc', now()),
  constraint report_cash_denominations_denomination_check check (denomination_value > 0),
  constraint report_cash_denominations_note_count_check check (note_count >= 0),
  constraint report_cash_denominations_unique_value unique (daily_report_id, denomination_value)
);

comment on table public.report_cash_denominations is 'Physical cash count by denomination for reconciliation.';
comment on column public.report_cash_denominations.line_total is 'Stored computed value for denomination_value multiplied by note_count.';

-- ---------------------------------------------------------------------------
-- Inventory movement lines per product for a route day.
-- ---------------------------------------------------------------------------
create table if not exists public.report_inventory_entries (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null,
  loading_qty integer not null default 0,
  sales_qty integer not null default 0,
  balance_qty integer generated always as (loading_qty - sales_qty) stored,
  lorry_qty integer not null default 0,
  variance_qty integer generated always as (lorry_qty - (loading_qty - sales_qty)) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint report_inventory_entries_quantities_check check (
    loading_qty >= 0 and sales_qty >= 0 and lorry_qty >= 0 and sales_qty <= loading_qty
  ),
  constraint report_inventory_entries_unit_price_check check (unit_price_snapshot >= 0),
  constraint report_inventory_entries_unique_product unique (daily_report_id, product_id)
);

comment on table public.report_inventory_entries is 'Inventory reconciliation per product for route loading, sales, and actual lorry balance.';
comment on column public.report_inventory_entries.balance_qty is 'Computed expected balance after sales.';
comment on column public.report_inventory_entries.variance_qty is 'Computed variance between actual lorry balance and expected balance.';

-- ---------------------------------------------------------------------------
-- Return and damage lines per report/product/invoice context.
-- ---------------------------------------------------------------------------
create table if not exists public.report_return_damage_entries (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null,
  invoice_no text,
  shop_name text,
  damage_qty integer not null default 0,
  return_qty integer not null default 0,
  free_issue_qty integer not null default 0,
  qty integer generated always as (damage_qty + return_qty + free_issue_qty) stored,
  value numeric(14,2) generated always as ((damage_qty + return_qty + free_issue_qty) * unit_price_snapshot) stored,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint report_return_damage_entries_quantities_check check (
    damage_qty >= 0 and return_qty >= 0 and free_issue_qty >= 0
  ),
  constraint report_return_damage_entries_non_empty_effect_check check (
    damage_qty + return_qty + free_issue_qty > 0
  ),
  constraint report_return_damage_entries_unit_price_check check (unit_price_snapshot >= 0)
);

comment on table public.report_return_damage_entries is 'Tracks damaged stock, customer returns, and free issues tied to a route report.';
comment on column public.report_return_damage_entries.qty is 'Computed total impacted quantity across damage, return, and free issue quantities.';
comment on column public.report_return_damage_entries.value is 'Computed quantity multiplied by unit price snapshot.';

-- ---------------------------------------------------------------------------
-- Foreign key indexes and report-date access patterns.
-- ---------------------------------------------------------------------------
create index if not exists daily_reports_report_date_idx on public.daily_reports (report_date);
create index if not exists daily_reports_route_program_id_idx on public.daily_reports (route_program_id);
create index if not exists daily_reports_prepared_by_idx on public.daily_reports (prepared_by);

create index if not exists report_invoice_entries_daily_report_id_idx on public.report_invoice_entries (daily_report_id);
create index if not exists report_expenses_daily_report_id_idx on public.report_expenses (daily_report_id);
create index if not exists report_expenses_expense_category_id_idx on public.report_expenses (expense_category_id);
create index if not exists report_cash_denominations_daily_report_id_idx on public.report_cash_denominations (daily_report_id);
create index if not exists report_inventory_entries_daily_report_id_idx on public.report_inventory_entries (daily_report_id);
create index if not exists report_inventory_entries_product_id_idx on public.report_inventory_entries (product_id);
create index if not exists report_return_damage_entries_daily_report_id_idx on public.report_return_damage_entries (daily_report_id);
create index if not exists report_return_damage_entries_product_id_idx on public.report_return_damage_entries (product_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers for mutable tables.
-- ---------------------------------------------------------------------------
drop trigger if exists set_route_programs_updated_at on public.route_programs;
create trigger set_route_programs_updated_at
before update on public.route_programs
for each row execute procedure public.set_updated_at();

drop trigger if exists set_expense_categories_updated_at on public.expense_categories;
create trigger set_expense_categories_updated_at
before update on public.expense_categories
for each row execute procedure public.set_updated_at();

drop trigger if exists set_daily_reports_updated_at on public.daily_reports;
create trigger set_daily_reports_updated_at
before update on public.daily_reports
for each row execute procedure public.set_updated_at();

drop trigger if exists set_report_inventory_entries_updated_at on public.report_inventory_entries;
create trigger set_report_inventory_entries_updated_at
before update on public.report_inventory_entries
for each row execute procedure public.set_updated_at();

drop trigger if exists set_report_return_damage_entries_updated_at on public.report_return_damage_entries;
create trigger set_report_return_damage_entries_updated_at
before update on public.report_return_damage_entries
for each row execute procedure public.set_updated_at();

commit;
