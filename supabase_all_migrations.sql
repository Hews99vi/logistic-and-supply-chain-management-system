

-- ============================================================================
-- supabase/migrations/0001_initial_schema.sql
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  legal_name text not null,
  display_name text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER', 'SALES_COORDINATOR')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVITED', 'DISABLED')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table if not exists public.depots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  cold_storage_capacity_liters numeric(12, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, code)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null check (category in ('MILK', 'YOGURT', 'CHEESE', 'BUTTER', 'ICE_CREAM', 'OTHER')),
  unit_of_measure text not null check (unit_of_measure in ('LITER', 'MILLILITER', 'KILOGRAM', 'GRAM', 'UNIT', 'CRATE')),
  base_price numeric(12, 2) not null check (base_price >= 0),
  cold_chain_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, sku)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  channel text not null default 'RETAIL' check (channel in ('RETAIL', 'WHOLESALE', 'INSTITUTIONAL')),
  phone text,
  email text,
  address_line_1 text,
  address_line_2 text,
  city text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, code)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.current_user_organization_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array_agg(organization_id),
    '{}'
  )
  from public.organization_memberships
  where user_id = auth.uid()
    and status = 'ACTIVE';
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_depots_updated_at on public.depots;
create trigger set_depots_updated_at
before update on public.depots
for each row execute procedure public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute procedure public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.depots enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;

drop policy if exists "organizations_select_by_membership" on public.organizations;
create policy "organizations_select_by_membership"
on public.organizations
for select
using (id = any(public.current_user_organization_ids()));

drop policy if exists "profiles_select_own_record" on public.profiles;
create policy "profiles_select_own_record"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "profiles_update_own_record" on public.profiles;
create policy "profiles_update_own_record"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "memberships_select_own_orgs" on public.organization_memberships;
create policy "memberships_select_own_orgs"
on public.organization_memberships
for select
using (organization_id = any(public.current_user_organization_ids()));

drop policy if exists "depots_access_by_membership" on public.depots;
create policy "depots_access_by_membership"
on public.depots
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));

drop policy if exists "products_access_by_membership" on public.products;
create policy "products_access_by_membership"
on public.products
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));

drop policy if exists "customers_access_by_membership" on public.customers;
create policy "customers_access_by_membership"
on public.customers
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));



-- ============================================================================
-- supabase/migrations/0002_storage.sql
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create or replace function public.can_access_storage_object(object_name text)
returns boolean
language sql
stable
as $$
  select split_part(object_name, '/', 1)::uuid = any(public.current_user_organization_ids());
$$;

drop policy if exists "organization_assets_read" on storage.objects;
create policy "organization_assets_read"
on storage.objects
for select
using (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

drop policy if exists "organization_assets_write" on storage.objects;
create policy "organization_assets_write"
on storage.objects
for insert
with check (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

drop policy if exists "organization_assets_update" on storage.objects;
create policy "organization_assets_update"
on storage.objects
for update
using (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
)
with check (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);



-- ============================================================================
-- supabase/migrations/0003_dairy_route_operations.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0004_auth_role_management.sql
-- ============================================================================

begin;

-- Ensure the profiles table exists for environments running this migration independently.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'driver',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_role_check check (role in ('admin', 'supervisor', 'driver', 'cashier'))
);

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

comment on table public.profiles is 'Application profile data for Supabase Auth users.';
comment on column public.profiles.role is 'Operational role used by RLS policies and backend authorization helpers.';
comment on column public.profiles.is_active is 'Soft access switch. Inactive users remain in auth but should not access app features.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'driver'));

  if requested_role not in ('admin', 'supervisor', 'driver', 'cashier') then
    requested_role := 'driver';
  end if;

  insert into public.profiles (
    id,
    full_name,
    phone,
    role,
    is_active
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    requested_role,
    true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    phone = excluded.phone,
    role = coalesce(public.profiles.role, excluded.role),
    is_active = coalesce(public.profiles.is_active, true);

  return new;
end;
$$;

comment on function public.handle_new_user() is 'Creates the application profile row after Supabase Auth signup with a safe default role.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'supervisor', false);
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'driver', false);
$$;

comment on function public.current_user_role() is 'Returns the active profile role for the currently authenticated user.';
comment on function public.is_admin() is 'True when the current authenticated user has the admin role.';
comment on function public.is_supervisor() is 'True when the current authenticated user has the supervisor role.';
comment on function public.is_driver() is 'True when the current authenticated user has the driver role.';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

commit;



-- ============================================================================
-- supabase/migrations/0005_operational_rls_policies.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helper functions for readable RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.has_active_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() is not null;
$$;

create or replace function public.is_cashier()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'cashier', false);
$$;

create or replace function public.can_self_update_profile(
  target_profile_id uuid,
  requested_role text,
  requested_is_active boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = target_profile_id
    and exists (
      select 1
      from public.profiles p
      where p.id = target_profile_id
        and p.role = requested_role
        and p.is_active = requested_is_active
    );
$$;

create or replace function public.can_view_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and (
        public.is_admin()
        or public.is_supervisor()
        or public.is_cashier()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and (
        public.is_admin()
        or public.is_supervisor()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_finance_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and (
        public.is_admin()
        or public.is_supervisor()
        or public.is_cashier()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

comment on function public.has_active_profile() is 'True when the authenticated user has an active application profile.';
comment on function public.is_cashier() is 'True when the current authenticated user has the cashier role.';
comment on function public.can_self_update_profile(uuid, text, boolean) is 'Allows users to edit their own profile without changing role or active status.';
comment on function public.can_view_daily_report(uuid) is 'Shared selector for report visibility. Cashiers can view reports for finance workflows; drivers only their own reports.';
comment on function public.can_manage_daily_report(uuid) is 'Shared editor rule for report ownership and supervisor/admin access.';
comment on function public.can_manage_finance_report(uuid) is 'Shared finance-section rule for admin, supervisor, cashier, and report owner.';

-- ---------------------------------------------------------------------------
-- Enable RLS on operational tables.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.route_programs enable row level security;
alter table public.products enable row level security;
alter table public.expense_categories enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_invoice_entries enable row level security;
alter table public.report_expenses enable row level security;
alter table public.report_cash_denominations enable row level security;
alter table public.report_inventory_entries enable row level security;
alter table public.report_return_damage_entries enable row level security;

-- ---------------------------------------------------------------------------
-- Drop older broad policies that would otherwise overlap.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_record" on public.profiles;
drop policy if exists "profiles_update_own_record" on public.profiles;
drop policy if exists "products_access_by_membership" on public.products;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy
on public.profiles
for select
to authenticated
using (
  public.has_active_profile()
  and (
    id = auth.uid()
    or public.is_admin()
    or public.is_supervisor()
  )
);

drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy
on public.profiles
for insert
to authenticated
with check (
  public.is_admin()
);

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy
on public.profiles
for update
to authenticated
using (
  public.has_active_profile()
  and (
    public.is_admin()
    or id = auth.uid()
  )
)
with check (
  public.is_admin()
  or public.can_self_update_profile(id, role, is_active)
);

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy
on public.profiles
for delete
to authenticated
using (
  public.is_admin()
);

-- ---------------------------------------------------------------------------
-- route_programs
-- ---------------------------------------------------------------------------
drop policy if exists route_programs_select_policy on public.route_programs;
create policy route_programs_select_policy
on public.route_programs
for select
to authenticated
using (
  public.has_active_profile()
);

drop policy if exists route_programs_insert_policy on public.route_programs;
create policy route_programs_insert_policy
on public.route_programs
for insert
to authenticated
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists route_programs_update_policy on public.route_programs;
create policy route_programs_update_policy
on public.route_programs
for update
to authenticated
using (
  public.is_admin() or public.is_supervisor()
)
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists route_programs_delete_policy on public.route_programs;
create policy route_programs_delete_policy
on public.route_programs
for delete
to authenticated
using (
  public.is_admin() or public.is_supervisor()
);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
drop policy if exists products_select_policy on public.products;
create policy products_select_policy
on public.products
for select
to authenticated
using (
  public.has_active_profile()
);

drop policy if exists products_insert_policy on public.products;
create policy products_insert_policy
on public.products
for insert
to authenticated
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists products_update_policy on public.products;
create policy products_update_policy
on public.products
for update
to authenticated
using (
  public.is_admin() or public.is_supervisor()
)
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists products_delete_policy on public.products;
create policy products_delete_policy
on public.products
for delete
to authenticated
using (
  public.is_admin() or public.is_supervisor()
);

-- ---------------------------------------------------------------------------
-- expense_categories
-- ---------------------------------------------------------------------------
drop policy if exists expense_categories_select_policy on public.expense_categories;
create policy expense_categories_select_policy
on public.expense_categories
for select
to authenticated
using (
  public.has_active_profile()
);

drop policy if exists expense_categories_insert_policy on public.expense_categories;
create policy expense_categories_insert_policy
on public.expense_categories
for insert
to authenticated
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists expense_categories_update_policy on public.expense_categories;
create policy expense_categories_update_policy
on public.expense_categories
for update
to authenticated
using (
  public.is_admin() or public.is_supervisor()
)
with check (
  public.is_admin() or public.is_supervisor()
);

drop policy if exists expense_categories_delete_policy on public.expense_categories;
create policy expense_categories_delete_policy
on public.expense_categories
for delete
to authenticated
using (
  public.is_admin() or public.is_supervisor()
);

-- ---------------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------------
drop policy if exists daily_reports_select_policy on public.daily_reports;
create policy daily_reports_select_policy
on public.daily_reports
for select
to authenticated
using (
  public.can_view_daily_report(id)
);

drop policy if exists daily_reports_insert_policy on public.daily_reports;
create policy daily_reports_insert_policy
on public.daily_reports
for insert
to authenticated
with check (
  (
    public.is_admin()
    or public.is_supervisor()
    or prepared_by = auth.uid()
  )
  and public.has_active_profile()
);

drop policy if exists daily_reports_update_policy on public.daily_reports;
create policy daily_reports_update_policy
on public.daily_reports
for update
to authenticated
using (
  public.can_manage_daily_report(id)
)
with check (
  public.is_admin()
  or public.is_supervisor()
  or prepared_by = auth.uid()
);

drop policy if exists daily_reports_delete_policy on public.daily_reports;
create policy daily_reports_delete_policy
on public.daily_reports
for delete
to authenticated
using (
  public.is_admin()
);

-- ---------------------------------------------------------------------------
-- report_invoice_entries
-- ---------------------------------------------------------------------------
drop policy if exists report_invoice_entries_select_policy on public.report_invoice_entries;
create policy report_invoice_entries_select_policy
on public.report_invoice_entries
for select
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_invoice_entries_insert_policy on public.report_invoice_entries;
create policy report_invoice_entries_insert_policy
on public.report_invoice_entries
for insert
to authenticated
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_invoice_entries_update_policy on public.report_invoice_entries;
create policy report_invoice_entries_update_policy
on public.report_invoice_entries
for update
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
)
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_invoice_entries_delete_policy on public.report_invoice_entries;
create policy report_invoice_entries_delete_policy
on public.report_invoice_entries
for delete
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

-- ---------------------------------------------------------------------------
-- report_expenses
-- ---------------------------------------------------------------------------
drop policy if exists report_expenses_select_policy on public.report_expenses;
create policy report_expenses_select_policy
on public.report_expenses
for select
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_expenses_insert_policy on public.report_expenses;
create policy report_expenses_insert_policy
on public.report_expenses
for insert
to authenticated
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_expenses_update_policy on public.report_expenses;
create policy report_expenses_update_policy
on public.report_expenses
for update
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
)
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_expenses_delete_policy on public.report_expenses;
create policy report_expenses_delete_policy
on public.report_expenses
for delete
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

-- ---------------------------------------------------------------------------
-- report_cash_denominations
-- ---------------------------------------------------------------------------
drop policy if exists report_cash_denominations_select_policy on public.report_cash_denominations;
create policy report_cash_denominations_select_policy
on public.report_cash_denominations
for select
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_cash_denominations_insert_policy on public.report_cash_denominations;
create policy report_cash_denominations_insert_policy
on public.report_cash_denominations
for insert
to authenticated
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_cash_denominations_update_policy on public.report_cash_denominations;
create policy report_cash_denominations_update_policy
on public.report_cash_denominations
for update
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
)
with check (
  public.can_manage_finance_report(daily_report_id)
);

drop policy if exists report_cash_denominations_delete_policy on public.report_cash_denominations;
create policy report_cash_denominations_delete_policy
on public.report_cash_denominations
for delete
to authenticated
using (
  public.can_manage_finance_report(daily_report_id)
);

-- ---------------------------------------------------------------------------
-- report_inventory_entries
-- ---------------------------------------------------------------------------
drop policy if exists report_inventory_entries_select_policy on public.report_inventory_entries;
create policy report_inventory_entries_select_policy
on public.report_inventory_entries
for select
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_inventory_entries_insert_policy on public.report_inventory_entries;
create policy report_inventory_entries_insert_policy
on public.report_inventory_entries
for insert
to authenticated
with check (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_inventory_entries_update_policy on public.report_inventory_entries;
create policy report_inventory_entries_update_policy
on public.report_inventory_entries
for update
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
)
with check (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_inventory_entries_delete_policy on public.report_inventory_entries;
create policy report_inventory_entries_delete_policy
on public.report_inventory_entries
for delete
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
);

-- ---------------------------------------------------------------------------
-- report_return_damage_entries
-- ---------------------------------------------------------------------------
drop policy if exists report_return_damage_entries_select_policy on public.report_return_damage_entries;
create policy report_return_damage_entries_select_policy
on public.report_return_damage_entries
for select
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_return_damage_entries_insert_policy on public.report_return_damage_entries;
create policy report_return_damage_entries_insert_policy
on public.report_return_damage_entries
for insert
to authenticated
with check (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_return_damage_entries_update_policy on public.report_return_damage_entries;
create policy report_return_damage_entries_update_policy
on public.report_return_damage_entries
for update
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
)
with check (
  public.can_manage_daily_report(daily_report_id)
);

drop policy if exists report_return_damage_entries_delete_policy on public.report_return_damage_entries;
create policy report_return_damage_entries_delete_policy
on public.report_return_damage_entries
for delete
to authenticated
using (
  public.can_manage_daily_report(daily_report_id)
);

commit;



-- ============================================================================
-- supabase/migrations/0006_daily_report_calculation_logic.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0007_daily_report_workflow.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Extend daily_reports with workflow audit fields.
-- ---------------------------------------------------------------------------
alter table public.daily_reports
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete restrict;

alter table public.daily_reports
  drop constraint if exists daily_reports_rejection_reason_check;

alter table public.daily_reports
  add constraint daily_reports_rejection_reason_check check (
    status <> 'rejected' or nullif(trim(rejection_reason), '') is not null
  );

comment on column public.daily_reports.rejection_reason is 'Supervisor or admin provided reason when a report is rejected.';
comment on column public.daily_reports.submitted_at is 'Timestamp when the report moved to submitted.';
comment on column public.daily_reports.submitted_by is 'User who submitted the report.';
comment on column public.daily_reports.approved_at is 'Timestamp when the report was approved.';
comment on column public.daily_reports.approved_by is 'User who approved the report.';
comment on column public.daily_reports.rejected_at is 'Timestamp when the report was rejected.';
comment on column public.daily_reports.rejected_by is 'User who rejected the report.';

-- ---------------------------------------------------------------------------
-- Workflow validation trigger for direct updates.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_daily_report_workflow_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_id uuid;
begin
  actor_id := auth.uid();
  actor_role := public.current_user_role();

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = 'approved' and actor_role <> 'admin' then
    if row(
      new.report_date,
      new.route_program_id,
      new.prepared_by,
      new.staff_name,
      new.territory_name_snapshot,
      new.route_name_snapshot,
      new.remarks,
      new.total_cash,
      new.total_cheques,
      new.total_credit,
      new.total_expenses,
      new.day_sale_total,
      new.total_sale,
      new.db_margin_percent,
      new.db_margin_value,
      new.net_profit,
      new.cash_in_hand,
      new.cash_in_bank,
      new.cash_book_total,
      new.cash_physical_total,
      new.cash_difference,
      new.total_bill_count,
      new.delivered_bill_count,
      new.cancelled_bill_count
    )
    is distinct from
    row(
      old.report_date,
      old.route_program_id,
      old.prepared_by,
      old.staff_name,
      old.territory_name_snapshot,
      old.route_name_snapshot,
      old.remarks,
      old.total_cash,
      old.total_cheques,
      old.total_credit,
      old.total_expenses,
      old.day_sale_total,
      old.total_sale,
      old.db_margin_percent,
      old.db_margin_value,
      old.net_profit,
      old.cash_in_hand,
      old.cash_in_bank,
      old.cash_book_total,
      old.cash_physical_total,
      old.cash_difference,
      old.total_bill_count,
      old.delivered_bill_count,
      old.cancelled_bill_count
    ) then
      raise exception 'Approved reports are locked. Admin override required.' using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'submitted' and actor_role = 'driver' then
    if row(
      new.report_date,
      new.route_program_id,
      new.prepared_by,
      new.staff_name,
      new.territory_name_snapshot,
      new.route_name_snapshot,
      new.remarks,
      new.total_cash,
      new.total_cheques,
      new.total_credit,
      new.total_expenses,
      new.day_sale_total,
      new.total_sale,
      new.db_margin_percent,
      new.db_margin_value,
      new.net_profit,
      new.cash_in_hand,
      new.cash_in_bank,
      new.cash_book_total,
      new.cash_physical_total,
      new.cash_difference,
      new.total_bill_count,
      new.delivered_bill_count,
      new.cancelled_bill_count
    )
    is distinct from
    row(
      old.report_date,
      old.route_program_id,
      old.prepared_by,
      old.staff_name,
      old.territory_name_snapshot,
      old.route_name_snapshot,
      old.remarks,
      old.total_cash,
      old.total_cheques,
      old.total_credit,
      old.total_expenses,
      old.day_sale_total,
      old.total_sale,
      old.db_margin_percent,
      old.db_margin_value,
      old.net_profit,
      old.cash_in_hand,
      old.cash_in_bank,
      old.cash_book_total,
      old.cash_physical_total,
      old.cash_difference,
      old.total_bill_count,
      old.delivered_bill_count,
      old.cancelled_bill_count
    ) then
      raise exception 'Submitted reports cannot be edited by drivers unless reopened.' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'approved' and new.approved_at is null then
    raise exception 'Approved reports must record approved_at.' using errcode = '23514';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    raise exception 'Submitted reports must record submitted_at.' using errcode = '23514';
  end if;

  if new.status = 'rejected' and (new.rejected_at is null or nullif(trim(new.rejection_reason), '') is null) then
    raise exception 'Rejected reports must record rejected_at and rejection_reason.' using errcode = '23514';
  end if;

  if new.status = 'draft' then
    if new.approved_at is not null or new.rejected_at is not null then
      raise exception 'Draft reports cannot retain approval or rejection timestamps.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_daily_report_workflow_guard() is 'Prevents invalid status edits and locks submitted or approved reports according to role.';

-- ---------------------------------------------------------------------------
-- Workflow transition functions.
-- ---------------------------------------------------------------------------
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

  if current_report.status <> 'draft' then
    raise exception 'Only draft reports can be submitted.' using errcode = 'P0001';
  end if;

  if actor_role not in ('admin', 'supervisor') and current_report.prepared_by <> actor_id then
    raise exception 'Only the report owner, supervisor, or admin can submit this report.' using errcode = '42501';
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
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

create or replace function public.approve_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can approve reports.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if current_report.status <> 'submitted' then
    raise exception 'Only submitted reports can be approved.' using errcode = 'P0001';
  end if;

  update public.daily_reports
  set
    status = 'approved',
    approved_at = timezone('utc', now()),
    approved_by = actor_id,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

create or replace function public.reject_daily_report(target_report_id uuid, reason text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
  cleaned_reason text := nullif(trim(coalesce(reason, '')), '');
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can reject reports.' using errcode = '42501';
  end if;

  if cleaned_reason is null then
    raise exception 'Rejection reason is required.' using errcode = '23514';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if current_report.status <> 'submitted' then
    raise exception 'Only submitted reports can be rejected.' using errcode = 'P0001';
  end if;

  update public.daily_reports
  set
    status = 'rejected',
    rejected_at = timezone('utc', now()),
    rejected_by = actor_id,
    rejection_reason = cleaned_reason,
    approved_at = null,
    approved_by = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

create or replace function public.reopen_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
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

  if current_report.status = 'draft' then
    raise exception 'Draft reports are already open.' using errcode = 'P0001';
  end if;

  if current_report.status = 'approved' and actor_role <> 'admin' then
    raise exception 'Only admin can reopen approved reports.' using errcode = '42501';
  end if;

  if current_report.status in ('submitted', 'rejected') and actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can reopen submitted or rejected reports.' using errcode = '42501';
  end if;

  update public.daily_reports
  set
    status = 'draft',
    submitted_at = null,
    submitted_by = null,
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

comment on function public.submit_daily_report(uuid) is 'Transitions a daily report from draft to submitted with actor tracking.';
comment on function public.approve_daily_report(uuid) is 'Transitions a submitted daily report to approved. Supervisor or admin only.';
comment on function public.reject_daily_report(uuid, text) is 'Transitions a submitted daily report to rejected with a required reason.';
comment on function public.reopen_daily_report(uuid) is 'Reopens submitted or rejected reports to draft; approved reports require admin override.';

-- ---------------------------------------------------------------------------
-- Bind workflow guard trigger.
-- ---------------------------------------------------------------------------
drop trigger if exists enforce_daily_report_workflow_guard on public.daily_reports;
create trigger enforce_daily_report_workflow_guard
before update on public.daily_reports
for each row execute procedure public.enforce_daily_report_workflow_guard();

commit;



-- ============================================================================
-- supabase/migrations/0008_daily_report_crud_support.sql
-- ============================================================================

begin;

alter table public.daily_reports
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete restrict;

comment on column public.daily_reports.deleted_at is 'Soft-delete timestamp. Deleted reports are excluded from normal read queries.';
comment on column public.daily_reports.deleted_by is 'User who soft-deleted the report.';

create index if not exists daily_reports_deleted_at_idx on public.daily_reports (deleted_at);
create index if not exists daily_reports_report_date_status_idx on public.daily_reports (report_date, status) where deleted_at is null;
create index if not exists daily_reports_route_status_idx on public.daily_reports (route_program_id, status) where deleted_at is null;
create index if not exists daily_reports_prepared_by_status_idx on public.daily_reports (prepared_by, status) where deleted_at is null;

commit;



-- ============================================================================
-- supabase/migrations/0009_daily_report_soft_delete_rls.sql
-- ============================================================================

begin;

create or replace function public.can_view_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and dr.deleted_at is null
      and (
        public.is_admin()
        or public.is_supervisor()
        or public.is_cashier()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and dr.deleted_at is null
      and (
        public.is_admin()
        or public.is_supervisor()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_finance_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    where dr.id = target_report_id
      and dr.deleted_at is null
      and (
        public.is_admin()
        or public.is_supervisor()
        or public.is_cashier()
        or dr.prepared_by = auth.uid()
      )
  );
$$;

commit;



-- ============================================================================
-- supabase/migrations/0010_report_invoice_entries_workflow_and_batch.sql
-- ============================================================================

begin;

create or replace function public.assert_daily_report_invoice_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Invoice entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit invoice entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'cashier', 'driver') then
    raise exception 'You are not allowed to edit invoice entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_invoice_entries_editable(uuid) is 'Ensures report invoice entry writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_invoice_entry_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_invoice_entries_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_invoice_entry_mutations() is 'Blocks insert, update, and delete on invoice entries when the parent daily report is locked.';

drop trigger if exists guard_report_invoice_entry_mutations on public.report_invoice_entries;
create trigger guard_report_invoice_entry_mutations
before insert or update or delete on public.report_invoice_entries
for each row execute procedure public.guard_report_invoice_entry_mutations();

create or replace function public.save_report_invoice_entries(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_invoice_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_line_no integer;
  entry_invoice_no text;
  entry_cash numeric(14,2);
  entry_cheque numeric(14,2);
  entry_credit numeric(14,2);
begin
  perform public.assert_daily_report_invoice_entries_editable(target_daily_report_id);

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
        from public.report_invoice_entries rie
        where rie.id = entry_id
          and rie.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Invoice entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_line_no := (entry ->> 'lineNo')::integer;
    entry_invoice_no := nullif(trim(coalesce(entry ->> 'invoiceNo', '')), '');
    entry_cash := coalesce((entry ->> 'cashAmount')::numeric, 0);
    entry_cheque := coalesce((entry ->> 'chequeAmount')::numeric, 0);
    entry_credit := coalesce((entry ->> 'creditAmount')::numeric, 0);

    if entry_line_no is null or entry_line_no < 1 then
      raise exception 'Each invoice entry must include a positive lineNo.' using errcode = '23514';
    end if;

    if entry_invoice_no is null then
      raise exception 'Each invoice entry must include an invoiceNo.' using errcode = '23514';
    end if;

    if entry_cash < 0 or entry_cheque < 0 or entry_credit < 0 then
      raise exception 'Invoice amounts must be non-negative.' using errcode = '23514';
    end if;

    if entry_cash + entry_cheque + entry_credit <= 0 then
      raise exception 'At least one payment amount must be greater than zero.' using errcode = '23514';
    end if;
  end loop;

  delete from public.report_invoice_entries
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_invoice_entries (
      id,
      daily_report_id,
      line_no,
      invoice_no,
      cash_amount,
      cheque_amount,
      credit_amount,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'lineNo')::integer,
      trim(entry ->> 'invoiceNo'),
      coalesce((entry ->> 'cashAmount')::numeric, 0),
      coalesce((entry ->> 'chequeAmount')::numeric, 0),
      coalesce((entry ->> 'creditAmount')::numeric, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_invoice_entries
  where daily_report_id = target_daily_report_id
  order by line_no asc;
end;
$$;

comment on function public.save_report_invoice_entries(uuid, jsonb) is 'Atomically replaces a report invoice entry set using frontend table order as the authoritative line ordering.';

grant execute on function public.assert_daily_report_invoice_entries_editable(uuid) to authenticated;
grant execute on function public.save_report_invoice_entries(uuid, jsonb) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0011_report_expenses_workflow_and_batch.sql
-- ============================================================================

begin;

create or replace function public.assert_daily_report_expenses_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Expense entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit expense entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'cashier', 'driver') then
    raise exception 'You are not allowed to edit expense entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_expenses_editable(uuid) is 'Ensures report expense writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_expense_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_expenses_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_expense_mutations() is 'Blocks insert, update, and delete on expense entries when the parent daily report is locked.';

drop trigger if exists guard_report_expense_mutations on public.report_expenses;
create trigger guard_report_expense_mutations
before insert or update or delete on public.report_expenses
for each row execute procedure public.guard_report_expense_mutations();

create or replace function public.save_report_expenses(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_line_no integer;
  entry_expense_category_id uuid;
  entry_custom_expense_name text;
  entry_amount numeric(14,2);
begin
  perform public.assert_daily_report_expenses_editable(target_daily_report_id);

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
        from public.report_expenses re
        where re.id = entry_id
          and re.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Expense entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_line_no := (entry ->> 'lineNo')::integer;
    entry_expense_category_id := nullif(entry ->> 'expenseCategoryId', '')::uuid;
    entry_custom_expense_name := nullif(trim(coalesce(entry ->> 'customExpenseName', '')), '');
    entry_amount := coalesce((entry ->> 'amount')::numeric, 0);

    if entry_line_no is null or entry_line_no < 1 then
      raise exception 'Each expense entry must include a positive lineNo.' using errcode = '23514';
    end if;

    if entry_expense_category_id is null and entry_custom_expense_name is null then
      raise exception 'Each expense entry must include either expenseCategoryId or customExpenseName.' using errcode = '23514';
    end if;

    if entry_expense_category_id is not null and not exists (
      select 1
      from public.expense_categories ec
      where ec.id = entry_expense_category_id
        and ec.is_active = true
    ) then
      raise exception 'The selected expense category does not exist or is inactive.' using errcode = '23503';
    end if;

    if entry_amount < 0 then
      raise exception 'Expense amount must be non-negative.' using errcode = '23514';
    end if;
  end loop;

  delete from public.report_expenses
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_expenses (
      id,
      daily_report_id,
      line_no,
      expense_category_id,
      custom_expense_name,
      amount,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'lineNo')::integer,
      nullif(entry ->> 'expenseCategoryId', '')::uuid,
      nullif(trim(coalesce(entry ->> 'customExpenseName', '')), ''),
      coalesce((entry ->> 'amount')::numeric, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_expenses
  where daily_report_id = target_daily_report_id
  order by line_no asc;
end;
$$;

comment on function public.save_report_expenses(uuid, jsonb) is 'Atomically replaces a report expense set using frontend table order as the authoritative line ordering.';

grant execute on function public.assert_daily_report_expenses_editable(uuid) to authenticated;
grant execute on function public.save_report_expenses(uuid, jsonb) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0012_report_cash_denominations_defaults_and_batch.sql
-- ============================================================================

begin;

create or replace function public.seed_default_report_cash_denominations(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_daily_report_id is null then
    return;
  end if;

  insert into public.report_cash_denominations (
    daily_report_id,
    denomination_value,
    note_count
  )
  select
    target_daily_report_id,
    default_values.denomination_value,
    0
  from (
    values
      (5000::numeric(12,2)),
      (1000::numeric(12,2)),
      (500::numeric(12,2)),
      (100::numeric(12,2)),
      (50::numeric(12,2)),
      (20::numeric(12,2)),
      (10::numeric(12,2)),
      (5::numeric(12,2)),
      (2::numeric(12,2)),
      (1::numeric(12,2))
  ) as default_values(denomination_value)
  where not exists (
    select 1
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_daily_report_id
      and rcd.denomination_value = default_values.denomination_value
  );
end;
$$;

comment on function public.seed_default_report_cash_denominations(uuid) is 'Ensures the standard 10 cash denomination rows exist for a daily report.';

create or replace function public.seed_default_report_cash_denominations_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_report_cash_denominations(new.id);
  return new;
end;
$$;

comment on function public.seed_default_report_cash_denominations_trigger() is 'Creates default denomination rows after a daily report is inserted.';

drop trigger if exists seed_default_report_cash_denominations_on_report_insert on public.daily_reports;
create trigger seed_default_report_cash_denominations_on_report_insert
after insert on public.daily_reports
for each row execute procedure public.seed_default_report_cash_denominations_trigger();

select public.seed_default_report_cash_denominations(dr.id)
from public.daily_reports dr
where dr.deleted_at is null;

create or replace function public.assert_daily_report_cash_denominations_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Cash denominations can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit cash denominations on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'cashier', 'driver') then
    raise exception 'You are not allowed to edit cash denominations.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_cash_denominations_editable(uuid) is 'Ensures cash denomination writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_cash_denomination_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_cash_denominations_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_cash_denomination_mutations() is 'Blocks cash denomination writes when the parent daily report is locked.';

drop trigger if exists guard_report_cash_denomination_mutations on public.report_cash_denominations;
create trigger guard_report_cash_denomination_mutations
before insert or update or delete on public.report_cash_denominations
for each row execute procedure public.guard_report_cash_denomination_mutations();

create or replace function public.save_report_cash_denominations(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_cash_denominations
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_denomination_value numeric(12,2);
  entry_note_count integer;
begin
  perform public.assert_daily_report_cash_denominations_editable(target_daily_report_id);
  perform public.seed_default_report_cash_denominations(target_daily_report_id);

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
    entry_denomination_value := (entry ->> 'denominationValue')::numeric(12,2);
    entry_note_count := (entry ->> 'noteCount')::integer;

    if entry_denomination_value not in (5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1) then
      raise exception 'Unsupported denomination value: %', entry_denomination_value using errcode = '23514';
    end if;

    if entry_note_count is null or entry_note_count < 0 then
      raise exception 'noteCount must be a non-negative whole number.' using errcode = '23514';
    end if;
  end loop;

  update public.report_cash_denominations
  set note_count = 0
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    update public.report_cash_denominations
    set note_count = (entry ->> 'noteCount')::integer
    where daily_report_id = target_daily_report_id
      and denomination_value = (entry ->> 'denominationValue')::numeric(12,2);
  end loop;

  return query
  select *
  from public.report_cash_denominations
  where daily_report_id = target_daily_report_id
  order by denomination_value desc;
end;
$$;

comment on function public.save_report_cash_denominations(uuid, jsonb) is 'Updates the standard denomination note counts for a daily report and returns the full ordered set.';

grant execute on function public.seed_default_report_cash_denominations(uuid) to authenticated;
grant execute on function public.assert_daily_report_cash_denominations_editable(uuid) to authenticated;
grant execute on function public.save_report_cash_denominations(uuid, jsonb) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0013_report_inventory_entries_workflow_and_batch.sql
-- ============================================================================

begin;

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
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_inventory_entry_snapshot() is 'Hydrates inventory snapshot fields from the selected product before write.';

drop trigger if exists populate_report_inventory_entry_snapshot on public.report_inventory_entries;
create trigger populate_report_inventory_entry_snapshot
before insert or update of product_id on public.report_inventory_entries
for each row execute procedure public.populate_report_inventory_entry_snapshot();

create or replace function public.assert_daily_report_inventory_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Inventory entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit inventory entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit inventory entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_inventory_entries_editable(uuid) is 'Ensures inventory writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_inventory_entry_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_inventory_entries_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_inventory_entry_mutations() is 'Blocks inventory entry writes when the parent daily report is locked.';

drop trigger if exists guard_report_inventory_entry_mutations on public.report_inventory_entries;
create trigger guard_report_inventory_entry_mutations
before insert or update or delete on public.report_inventory_entries
for each row execute procedure public.guard_report_inventory_entry_mutations();

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

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
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
    insert into public.report_inventory_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      loading_qty,
      sales_qty,
      lorry_qty
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      coalesce((entry ->> 'loadingQty')::integer, 0),
      coalesce((entry ->> 'salesQty')::integer, 0),
      coalesce((entry ->> 'lorryQty')::integer, 0)
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by product_name_snapshot asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is 'Atomically replaces a report inventory set with one row per product and auto-filled product snapshots.';

grant execute on function public.assert_daily_report_inventory_entries_editable(uuid) to authenticated;
grant execute on function public.save_report_inventory_entries(uuid, jsonb) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0014_report_return_damage_entries_workflow_and_batch.sql
-- ============================================================================

begin;

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
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_return_damage_entry_snapshot() is 'Hydrates return and damage snapshot fields from the selected product before write.';

drop trigger if exists populate_report_return_damage_entry_snapshot on public.report_return_damage_entries;
create trigger populate_report_return_damage_entry_snapshot
before insert or update of product_id on public.report_return_damage_entries
for each row execute procedure public.populate_report_return_damage_entry_snapshot();

create or replace function public.assert_daily_report_return_damage_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Return and damage entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit return and damage entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit return and damage entries.' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_daily_report_return_damage_entries_editable(uuid) is 'Ensures return and damage writes only happen on editable draft reports with valid role access.';

create or replace function public.guard_report_return_damage_entry_mutations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_report_id uuid;
begin
  target_report_id := case
    when tg_op = 'DELETE' then old.daily_report_id
    else new.daily_report_id
  end;

  perform public.assert_daily_report_return_damage_entries_editable(target_report_id);
  return coalesce(new, old);
end;
$$;

comment on function public.guard_report_return_damage_entry_mutations() is 'Blocks return and damage writes when the parent daily report is locked.';

drop trigger if exists guard_report_return_damage_entry_mutations on public.report_return_damage_entries;
create trigger guard_report_return_damage_entry_mutations
before insert or update or delete on public.report_return_damage_entries
for each row execute procedure public.guard_report_return_damage_entry_mutations();

create or replace function public.save_report_return_damage_entries(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_return_damage_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_damage_qty integer;
  entry_return_qty integer;
  entry_free_issue_qty integer;
begin
  perform public.assert_daily_report_return_damage_entries_editable(target_daily_report_id);

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
        from public.report_return_damage_entries rrde
        where rrde.id = entry_id
          and rrde.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Return or damage entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_damage_qty := coalesce((entry ->> 'damageQty')::integer, 0);
    entry_return_qty := coalesce((entry ->> 'returnQty')::integer, 0);
    entry_free_issue_qty := coalesce((entry ->> 'freeIssueQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each return or damage entry must include productId.' using errcode = '23514';
    end if;

    if entry_damage_qty < 0 or entry_return_qty < 0 or entry_free_issue_qty < 0 then
      raise exception 'Return and damage quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_damage_qty + entry_return_qty + entry_free_issue_qty <= 0 then
      raise exception 'At least one of damageQty, returnQty, or freeIssueQty must be greater than zero.' using errcode = '23514';
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

  delete from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_return_damage_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      invoice_no,
      shop_name,
      damage_qty,
      return_qty,
      free_issue_qty,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      nullif(trim(coalesce(entry ->> 'invoiceNo', '')), ''),
      nullif(trim(coalesce(entry ->> 'shopName', '')), ''),
      coalesce((entry ->> 'damageQty')::integer, 0),
      coalesce((entry ->> 'returnQty')::integer, 0),
      coalesce((entry ->> 'freeIssueQty')::integer, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id
  order by created_at asc;
end;
$$;

comment on function public.save_report_return_damage_entries(uuid, jsonb) is 'Atomically replaces a report return and damage set with auto-filled product snapshots and generated qty/value.';

grant execute on function public.assert_daily_report_return_damage_entries_editable(uuid) to authenticated;
grant execute on function public.save_report_return_damage_entries(uuid, jsonb) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0015_dashboard_reporting_functions.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0016_audit_logs.sql
-- ============================================================================

begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action_type text not null check (action_type in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

comment on table public.audit_logs is 'Immutable audit trail for key operational and master-data tables.';
comment on column public.audit_logs.table_name is 'The audited table name.';
comment on column public.audit_logs.record_id is 'Primary key of the affected record.';
comment on column public.audit_logs.action_type is 'Database action type: INSERT, UPDATE, or DELETE.';
comment on column public.audit_logs.old_data is 'JSON snapshot of the row before the change.';
comment on column public.audit_logs.new_data is 'JSON snapshot of the row after the change.';
comment on column public.audit_logs.changed_by is 'Authenticated profile id when available from auth.uid().';
comment on column public.audit_logs.changed_at is 'UTC timestamp when the change was recorded.';

create index if not exists audit_logs_table_record_changed_at_idx
  on public.audit_logs (table_name, record_id, changed_at desc);

create index if not exists audit_logs_changed_at_idx
  on public.audit_logs (changed_at desc);

create index if not exists audit_logs_changed_by_idx
  on public.audit_logs (changed_by, changed_at desc)
  where changed_by is not null;

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
on public.audit_logs
for select
to authenticated
using (
  public.is_admin() or public.is_supervisor()
);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  before_data jsonb;
  after_data jsonb;
  normalized_before jsonb;
  normalized_after jsonb;
  target_record_id uuid;
begin
  if tg_op = 'INSERT' then
    after_data := to_jsonb(new);
    target_record_id := new.id;

    insert into public.audit_logs (
      table_name,
      record_id,
      action_type,
      old_data,
      new_data,
      changed_by,
      changed_at
    )
    values (
      tg_table_name,
      target_record_id,
      'INSERT',
      null,
      after_data,
      actor_id,
      timezone('utc', now())
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    before_data := to_jsonb(old);
    after_data := to_jsonb(new);
    normalized_before := before_data - 'updated_at';
    normalized_after := after_data - 'updated_at';
    target_record_id := new.id;

    if normalized_before = normalized_after then
      return new;
    end if;

    insert into public.audit_logs (
      table_name,
      record_id,
      action_type,
      old_data,
      new_data,
      changed_by,
      changed_at
    )
    values (
      tg_table_name,
      target_record_id,
      'UPDATE',
      before_data,
      after_data,
      actor_id,
      timezone('utc', now())
    );

    return new;
  end if;

  before_data := to_jsonb(old);
  target_record_id := old.id;

  insert into public.audit_logs (
    table_name,
    record_id,
    action_type,
    old_data,
    new_data,
    changed_by,
    changed_at
  )
  values (
    tg_table_name,
    target_record_id,
    'DELETE',
    before_data,
    null,
    actor_id,
    timezone('utc', now())
  );

  return old;
end;
$$;

comment on function public.write_audit_log() is 'Generic trigger function that writes INSERT, UPDATE, and DELETE row snapshots to audit_logs.';

create or replace function public.get_report_audit_history(target_report_id uuid)
returns table(
  id uuid,
  table_name text,
  record_id uuid,
  action_type text,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    al.id,
    al.table_name,
    al.record_id,
    al.action_type,
    al.old_data,
    al.new_data,
    al.changed_by,
    al.changed_at
  from public.audit_logs al
  where (
    al.table_name = 'daily_reports'
    and al.record_id = target_report_id
  )
  or (
    al.table_name in (
      'report_invoice_entries',
      'report_expenses',
      'report_cash_denominations',
      'report_inventory_entries',
      'report_return_damage_entries'
    )
    and (
      (al.new_data ->> 'daily_report_id')::uuid = target_report_id
      or (al.old_data ->> 'daily_report_id')::uuid = target_report_id
    )
  )
  order by al.changed_at desc, al.id desc;
$$;

comment on function public.get_report_audit_history(uuid) is 'Returns audit history for a report and all of its child records.';

grant execute on function public.get_report_audit_history(uuid) to authenticated;

drop trigger if exists audit_daily_reports on public.daily_reports;
create trigger audit_daily_reports
after insert or update or delete on public.daily_reports
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_invoice_entries on public.report_invoice_entries;
create trigger audit_report_invoice_entries
after insert or update or delete on public.report_invoice_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_expenses on public.report_expenses;
create trigger audit_report_expenses
after insert or update or delete on public.report_expenses
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_cash_denominations on public.report_cash_denominations;
create trigger audit_report_cash_denominations
after insert or update or delete on public.report_cash_denominations
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_inventory_entries on public.report_inventory_entries;
create trigger audit_report_inventory_entries
after insert or update or delete on public.report_inventory_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_return_damage_entries on public.report_return_damage_entries;
create trigger audit_report_return_damage_entries
after insert or update or delete on public.report_return_damage_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_products on public.products;
create trigger audit_products
after insert or update or delete on public.products
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_route_programs on public.route_programs;
create trigger audit_route_programs
after insert or update or delete on public.route_programs
for each row execute procedure public.write_audit_log();

commit;



-- ============================================================================
-- supabase/migrations/0017_profiles_rls_recursion_fix.sql
-- ============================================================================

begin;

-- Fix recursive RLS evaluation on public.profiles.
-- Previous policy expressions called helper functions that read public.profiles,
-- which could recurse during policy checks and cause "stack depth limit exceeded".

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
);

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy
on public.profiles
for delete
to authenticated
using (
  false
);

commit;



-- ============================================================================
-- supabase/migrations/0018_memberships_rls_recursion_fix.sql
-- ============================================================================

begin;

-- Fix recursive RLS on organization_memberships.
-- Old policy used current_user_organization_ids(), which reads organization_memberships,
-- causing recursive policy evaluation and stack depth errors.

drop policy if exists "memberships_select_own_orgs" on public.organization_memberships;
drop policy if exists organization_memberships_select_policy on public.organization_memberships;
drop policy if exists organization_memberships_insert_policy on public.organization_memberships;
drop policy if exists organization_memberships_update_policy on public.organization_memberships;
drop policy if exists organization_memberships_delete_policy on public.organization_memberships;

create policy organization_memberships_select_policy
on public.organization_memberships
for select
to authenticated
using (
  user_id = auth.uid() or public.is_admin() or public.is_supervisor()
);

create policy organization_memberships_insert_policy
on public.organization_memberships
for insert
to authenticated
with check (
  public.is_admin()
);

create policy organization_memberships_update_policy
on public.organization_memberships
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy organization_memberships_delete_policy
on public.organization_memberships
for delete
to authenticated
using (
  public.is_admin()
);

commit;



-- ============================================================================
-- supabase/migrations/0019_daily_loading_summary_lifecycle.sql
-- ============================================================================

begin;

alter table public.daily_reports
  add column if not exists loading_completed_at timestamptz,
  add column if not exists loading_completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists loading_notes text;

alter table public.daily_reports
  drop constraint if exists daily_reports_loading_completion_check;

alter table public.daily_reports
  add constraint daily_reports_loading_completion_check check (
    (loading_completed_at is null and loading_completed_by is null)
    or (loading_completed_at is not null and loading_completed_by is not null)
  );

comment on column public.daily_reports.loading_completed_at is 'Timestamp when morning loading was finalized before route dispatch.';
comment on column public.daily_reports.loading_completed_by is 'User who finalized morning loading.';
comment on column public.daily_reports.loading_notes is 'Optional notes specific to the morning loading summary.';

create index if not exists daily_reports_loading_completed_at_idx
  on public.daily_reports (loading_completed_at desc)
  where deleted_at is null;

commit;



-- ============================================================================
-- supabase/migrations/0020_route_programs_organization_scope.sql
-- ============================================================================

begin;

alter table public.route_programs
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

do $$
declare
  fallback_organization_id uuid;
begin
  if exists (select 1 from public.route_programs where organization_id is null) then
    select id
    into fallback_organization_id
    from public.organizations
    order by created_at asc
    limit 1;

    if fallback_organization_id is null then
      raise exception 'Cannot backfill route_programs.organization_id because no organizations exist.';
    end if;

    update public.route_programs
    set organization_id = fallback_organization_id
    where organization_id is null;
  end if;
end;
$$;

alter table public.route_programs
  alter column organization_id set not null;

alter table public.route_programs
  drop constraint if exists route_programs_business_key;

alter table public.route_programs
  add constraint route_programs_business_key
  unique (organization_id, territory_name, day_of_week, route_name);

create index if not exists route_programs_organization_idx
  on public.route_programs (organization_id);

drop policy if exists route_programs_select_policy on public.route_programs;
create policy route_programs_select_policy
on public.route_programs
for select
to authenticated
using (
  public.has_active_profile()
  and organization_id = any(public.current_user_organization_ids())
);

drop policy if exists route_programs_insert_policy on public.route_programs;
create policy route_programs_insert_policy
on public.route_programs
for insert
to authenticated
with check (
  (public.is_admin() or public.is_supervisor())
  and organization_id = any(public.current_user_organization_ids())
);

drop policy if exists route_programs_update_policy on public.route_programs;
create policy route_programs_update_policy
on public.route_programs
for update
to authenticated
using (
  (public.is_admin() or public.is_supervisor())
  and organization_id = any(public.current_user_organization_ids())
)
with check (
  (public.is_admin() or public.is_supervisor())
  and organization_id = any(public.current_user_organization_ids())
);

drop policy if exists route_programs_delete_policy on public.route_programs;
create policy route_programs_delete_policy
on public.route_programs
for delete
to authenticated
using (
  (public.is_admin() or public.is_supervisor())
  and organization_id = any(public.current_user_organization_ids())
);

commit;



-- ============================================================================
-- supabase/migrations/0021_daily_report_submit_completeness.sql
-- ============================================================================

begin;

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
  invoice_entry_count bigint := 0;
  positive_denomination_count bigint := 0;
  requires_cash_check boolean := false;
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

  if current_report.status <> 'draft' then
    raise exception 'Only draft reports can be submitted.' using errcode = 'P0001';
  end if;

  if actor_role not in ('admin', 'supervisor') and current_report.prepared_by <> actor_id then
    raise exception 'Only the report owner, supervisor, or admin can submit this report.' using errcode = '42501';
  end if;

  select count(*)
  into invoice_entry_count
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_report_id;

  if invoice_entry_count = 0 then
    raise exception 'Add at least one invoice entry before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count is null
     or current_report.delivered_bill_count is null
     or current_report.cancelled_bill_count is null then
    raise exception 'Total, delivered, and cancel bill counts must be provided before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count <= 0 then
    raise exception 'Total bill count must be greater than zero before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.delivered_bill_count + current_report.cancelled_bill_count > current_report.total_bill_count then
    raise exception 'Delivered and cancel bill counts cannot exceed total bill count.' using errcode = '23514';
  end if;

  requires_cash_check :=
    current_report.total_cash > 0
    or current_report.cash_in_hand > 0
    or current_report.cash_physical_total > 0;

  if requires_cash_check then
    select count(*)
    into positive_denomination_count
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_report_id
      and rcd.note_count > 0;

    if positive_denomination_count = 0 then
      raise exception 'Record denomination counts with at least one positive note count before submitting the DATE report.' using errcode = '23514';
    end if;
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
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

comment on function public.submit_daily_report(uuid) is 'Transitions a daily report from draft to submitted after validating DATE end-of-day completeness requirements.';

grant execute on function public.submit_daily_report(uuid) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0022_product_structured_sku_fields.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0023_product_structured_sku_backfill.sql
-- ============================================================================

begin;

create or replace function public.parse_legacy_product_pack_pattern(raw_name text)
returns table (
  parsed_family text,
  parsed_unit_size numeric,
  parsed_unit_measure text,
  parsed_pack_size integer,
  confidence text
)
language plpgsql
immutable
as $$
declare
  normalized text;
  matches text[];
begin
  normalized := regexp_replace(trim(coalesce(raw_name, '')), '\s+', ' ', 'g');

  if normalized = '' then
    return;
  end if;

  matches := regexp_match(
    normalized,
    '^(.*?)(?:\s+)?(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\s*[xX]\s*(\d+)\s*$',
    'i'
  );

  if matches is null then
    return;
  end if;

  parsed_family := nullif(trim(matches[1]), '');
  parsed_unit_size := matches[2]::numeric;
  parsed_unit_measure := lower(matches[3]);
  parsed_pack_size := matches[4]::integer;
  confidence := case
    when parsed_family is null then 'pack_suffix_only'
    else 'pack_suffix_with_family'
  end;

  return next;
end;
$$;

comment on function public.parse_legacy_product_pack_pattern(text) is 'Conservative one-time migration helper that extracts unit size, measure, and pack size from legacy product names only when the pattern is confidently recognized.';

with parsed_candidates as (
  select
    p.id,
    parsed.parsed_family,
    parsed.parsed_unit_size,
    parsed.parsed_unit_measure,
    parsed.parsed_pack_size,
    parsed.confidence
  from public.products p
  cross join lateral public.parse_legacy_product_pack_pattern(
    coalesce(
      nullif(trim(p.product_name), ''),
      nullif(trim(p.display_name), ''),
      nullif(trim(p.name), '')
    )
  ) parsed
)
update public.products p
set
  unit_size = coalesce(p.unit_size, parsed.parsed_unit_size),
  unit_measure = coalesce(p.unit_measure, parsed.parsed_unit_measure),
  pack_size = coalesce(p.pack_size, parsed.parsed_pack_size),
  product_family = case
    when parsed.parsed_family is not null
      and (
        p.product_family is null
        or nullif(trim(p.product_family), '') is null
        or trim(p.product_family) = trim(p.product_name)
        or trim(p.product_family) = trim(p.display_name)
      )
      then parsed.parsed_family
    else p.product_family
  end,
  display_name = coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.product_name), ''),
    nullif(trim(p.name), ''),
    p.product_family
  )
from parsed_candidates parsed
where parsed.id = p.id
  and (
    p.unit_size is null
    or p.unit_measure is null
    or p.pack_size is null
    or (
      parsed.parsed_family is not null
      and (
        p.product_family is null
        or nullif(trim(p.product_family), '') is null
        or trim(p.product_family) = trim(p.product_name)
        or trim(p.product_family) = trim(p.display_name)
      )
    )
  );

drop view if exists public.product_structuring_backfill_review;
create view public.product_structuring_backfill_review as
select
  p.id,
  p.organization_id,
  p.product_code,
  p.product_name,
  p.display_name,
  p.product_family,
  p.variant,
  p.unit_size,
  p.unit_measure,
  p.pack_size,
  p.selling_unit,
  case
    when p.unit_size is not null and p.unit_measure is not null and p.pack_size is not null then 'structured_or_confidently_parsed'
    when exists (
      select 1
      from public.parse_legacy_product_pack_pattern(coalesce(nullif(trim(p.product_name), ''), nullif(trim(p.display_name), ''), nullif(trim(p.name), ''))) parsed
    ) then 'partially_structured_review_recommended'
    else 'manual_review_required'
  end as migration_status
from public.products p;

comment on view public.product_structuring_backfill_review is 'Review helper for gradual SKU structuring. Rows marked manual_review_required were intentionally left conservative by the backfill.';

grant select on public.product_structuring_backfill_review to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0024_report_product_structured_snapshots.sql
-- ============================================================================

begin;

alter table public.report_inventory_entries
  add column if not exists product_display_name_snapshot text,
  add column if not exists brand_snapshot text,
  add column if not exists product_family_snapshot text,
  add column if not exists variant_snapshot text,
  add column if not exists unit_size_snapshot numeric,
  add column if not exists unit_measure_snapshot text,
  add column if not exists pack_size_snapshot integer,
  add column if not exists selling_unit_snapshot text;

alter table public.report_return_damage_entries
  add column if not exists product_display_name_snapshot text,
  add column if not exists brand_snapshot text,
  add column if not exists product_family_snapshot text,
  add column if not exists variant_snapshot text,
  add column if not exists unit_size_snapshot numeric,
  add column if not exists unit_measure_snapshot text,
  add column if not exists pack_size_snapshot integer,
  add column if not exists selling_unit_snapshot text;

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
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_inventory_entry_snapshot() is 'Hydrates inventory snapshot fields, including structured SKU fields, from the selected product before write.';

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
  new.unit_price_snapshot := source_product.unit_price;
  return new;
end;
$$;

comment on function public.populate_report_return_damage_entry_snapshot() is 'Hydrates return and damage snapshot fields, including structured SKU fields, from the selected product before write.';

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries disable trigger guard_report_return_damage_entry_mutations;

update public.report_inventory_entries rie
set product_display_name_snapshot = coalesce(rie.product_display_name_snapshot, p.display_name, p.product_name),
    brand_snapshot = coalesce(rie.brand_snapshot, p.brand),
    product_family_snapshot = coalesce(rie.product_family_snapshot, p.product_family),
    variant_snapshot = coalesce(rie.variant_snapshot, p.variant),
    unit_size_snapshot = coalesce(rie.unit_size_snapshot, p.unit_size),
    unit_measure_snapshot = coalesce(rie.unit_measure_snapshot, p.unit_measure),
    pack_size_snapshot = coalesce(rie.pack_size_snapshot, p.pack_size),
    selling_unit_snapshot = coalesce(rie.selling_unit_snapshot, p.selling_unit)
from public.products p
where p.id = rie.product_id;

update public.report_return_damage_entries rrde
set product_display_name_snapshot = coalesce(rrde.product_display_name_snapshot, p.display_name, p.product_name),
    brand_snapshot = coalesce(rrde.brand_snapshot, p.brand),
    product_family_snapshot = coalesce(rrde.product_family_snapshot, p.product_family),
    variant_snapshot = coalesce(rrde.variant_snapshot, p.variant),
    unit_size_snapshot = coalesce(rrde.unit_size_snapshot, p.unit_size),
    unit_measure_snapshot = coalesce(rrde.unit_measure_snapshot, p.unit_measure),
    pack_size_snapshot = coalesce(rrde.pack_size_snapshot, p.pack_size),
    selling_unit_snapshot = coalesce(rrde.selling_unit_snapshot, p.selling_unit)
from public.products p
where p.id = rrde.product_id;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;
alter table public.report_return_damage_entries enable trigger guard_report_return_damage_entry_mutations;

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

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
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
    insert into public.report_inventory_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      loading_qty,
      sales_qty,
      lorry_qty
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      coalesce((entry ->> 'loadingQty')::integer, 0),
      coalesce((entry ->> 'salesQty')::integer, 0),
      coalesce((entry ->> 'lorryQty')::integer, 0)
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is 'Atomically replaces a report inventory set with one row per product and auto-filled legacy plus structured product snapshots.';

create or replace function public.save_report_return_damage_entries(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_return_damage_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_damage_qty integer;
  entry_return_qty integer;
  entry_free_issue_qty integer;
begin
  perform public.assert_daily_report_return_damage_entries_editable(target_daily_report_id);

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
        from public.report_return_damage_entries rrde
        where rrde.id = entry_id
          and rrde.daily_report_id = target_daily_report_id
      ) then
        raise exception 'Return or damage entry id % does not belong to this report.', entry_id using errcode = 'P0002';
      end if;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_damage_qty := coalesce((entry ->> 'damageQty')::integer, 0);
    entry_return_qty := coalesce((entry ->> 'returnQty')::integer, 0);
    entry_free_issue_qty := coalesce((entry ->> 'freeIssueQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each return or damage entry must include productId.' using errcode = '23514';
    end if;

    if entry_damage_qty < 0 or entry_return_qty < 0 or entry_free_issue_qty < 0 then
      raise exception 'Return and damage quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_damage_qty + entry_return_qty + entry_free_issue_qty <= 0 then
      raise exception 'At least one of damageQty, returnQty, or freeIssueQty must be greater than zero.' using errcode = '23514';
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

  delete from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id;

  for entry in
    select value
    from jsonb_array_elements(input_entries)
  loop
    insert into public.report_return_damage_entries (
      id,
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      invoice_no,
      shop_name,
      damage_qty,
      return_qty,
      free_issue_qty,
      notes
    )
    values (
      coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
      target_daily_report_id,
      (entry ->> 'productId')::uuid,
      '',
      '',
      0,
      nullif(trim(coalesce(entry ->> 'invoiceNo', '')), ''),
      nullif(trim(coalesce(entry ->> 'shopName', '')), ''),
      coalesce((entry ->> 'damageQty')::integer, 0),
      coalesce((entry ->> 'returnQty')::integer, 0),
      coalesce((entry ->> 'freeIssueQty')::integer, 0),
      nullif(trim(coalesce(entry ->> 'notes', '')), '')
    );
  end loop;

  return query
  select *
  from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id
  order by created_at asc;
end;
$$;

comment on function public.save_report_return_damage_entries(uuid, jsonb) is 'Atomically replaces a report return and damage set with auto-filled legacy plus structured product snapshots and generated qty/value.';

commit;



-- ============================================================================
-- supabase/migrations/0025_product_quantity_entry_mode.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0026_main_inventory.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Main Inventory (Outside Freezer) Tracking
-- ---------------------------------------------------------------------------

create table if not exists public.main_inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint main_inventory_unique_org_product unique (organization_id, product_id)
);

comment on table public.main_inventory is 'Tracks the central stock (outside freezer) per product for each organization.';
comment on column public.main_inventory.quantity is 'Current stock level. Allowed to go negative to support post-reconciliation workflows.';

drop trigger if exists set_main_inventory_updated_at on public.main_inventory;
create trigger set_main_inventory_updated_at
before update on public.main_inventory
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory Transactions Audit Log
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_change integer not null,
  transaction_type text not null,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint inventory_transactions_type_check check (
    transaction_type in ('RECEIPT', 'LOAD_OUT', 'LORRY_RETURN', 'ADJUSTMENT')
  )
);

comment on table public.inventory_transactions is 'Audit log for all IN/OUT/ADJUST movements affecting main_inventory.';

create index if not exists inventory_transactions_org_product_idx on public.inventory_transactions (organization_id, product_id);
create index if not exists inventory_transactions_reference_idx on public.inventory_transactions (reference_id);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

alter table public.main_inventory enable row level security;
alter table public.inventory_transactions enable row level security;

-- main_inventory policies
drop policy if exists main_inventory_select_policy on public.main_inventory;
create policy main_inventory_select_policy
on public.main_inventory
for select
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

drop policy if exists main_inventory_insert_policy on public.main_inventory;
create policy main_inventory_insert_policy
on public.main_inventory
for insert
to authenticated
with check (organization_id = any(public.current_user_organization_ids()));

drop policy if exists main_inventory_update_policy on public.main_inventory;
create policy main_inventory_update_policy
on public.main_inventory
for update
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

-- inventory_transactions policies
drop policy if exists inventory_transactions_select_policy on public.inventory_transactions;
create policy inventory_transactions_select_policy
on public.inventory_transactions
for select
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

drop policy if exists inventory_transactions_insert_policy on public.inventory_transactions;
create policy inventory_transactions_insert_policy
on public.inventory_transactions
for insert
to authenticated
with check (organization_id = any(public.current_user_organization_ids()));


-- ---------------------------------------------------------------------------
-- RPC: Receive Main Inventory (Direct stock receipts)
-- ---------------------------------------------------------------------------

create or replace function public.receive_main_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns public.main_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_new_inventory public.main_inventory%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero.' using errcode = 'P0001';
  end if;

  -- Upsert into main_inventory
  insert into public.main_inventory (organization_id, product_id, quantity)
  values (p_organization_id, p_product_id, p_quantity)
  on conflict (organization_id, product_id)
  do update set quantity = public.main_inventory.quantity + p_quantity, updated_at = timezone('utc', now())
  returning * into v_new_inventory;

  -- Log transaction
  insert into public.inventory_transactions (
    organization_id, product_id, quantity_change, transaction_type, notes, created_by
  ) values (
    p_organization_id, p_product_id, p_quantity, 'RECEIPT', p_notes, actor_id
  );

  return v_new_inventory;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Finalize Loading Summary (Deduct stock)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_loading_summary(
  p_summary_id uuid,
  p_loading_notes text default null
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft loading summaries can be finalized.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is not null then
    raise exception 'Loading has already been finalized.' using errcode = 'P0001';
  end if;

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  -- Deduct inventory for each loading entry
  for v_entry in 
    select product_id, loading_qty 
    from public.report_inventory_entries 
    where daily_report_id = p_summary_id and loading_qty > 0
  loop
    -- Upsert and deduct stock (allowing negative)
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, -v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity - v_entry.loading_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, -v_entry.loading_qty, 'LOAD_OUT', p_summary_id, actor_id
    );
  end loop;

  -- Update report
  update public.daily_reports
  set
    loading_completed_at = timezone('utc', now()),
    loading_completed_by = actor_id,
    loading_notes = coalesce(p_loading_notes, v_report.loading_notes)
  where id = p_summary_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update approve_daily_report to Handle Lorry Returns
-- ---------------------------------------------------------------------------

create or replace function public.approve_daily_report(target_report_id uuid)
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
  v_entry record;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can approve reports.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if current_report.status <> 'submitted' then
    raise exception 'Only submitted reports can be approved.' using errcode = 'P0001';
  end if;

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

  -- Add returned lorry stock back to main inventory
  for v_entry in 
    select product_id, lorry_qty 
    from public.report_inventory_entries 
    where daily_report_id = target_report_id and lorry_qty > 0
  loop
    -- Upsert and add stock
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, v_entry.lorry_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity + v_entry.lorry_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, v_entry.lorry_qty, 'LORRY_RETURN', target_report_id, actor_id
    );
  end loop;

  update public.daily_reports
  set
    status = 'approved',
    approved_at = timezone('utc', now()),
    approved_by = actor_id,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

commit;



-- ============================================================================
-- supabase/migrations/0027_dsd_inventory_standards.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extend Inventory Transactions Types
-- ---------------------------------------------------------------------------

alter table public.inventory_transactions drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions add constraint inventory_transactions_type_check check (
  transaction_type in ('RECEIPT', 'LOAD_OUT', 'LORRY_RETURN', 'ADJUSTMENT', 'LOAD_OUT_REVERT', 'LORRY_RETURN_REVERT')
);

-- ---------------------------------------------------------------------------
-- 2. Strict Load Out Locking for Inventory Edits
-- ---------------------------------------------------------------------------

create or replace function public.assert_daily_report_inventory_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Inventory entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if target_report.loading_completed_at is not null then
    raise exception 'Loading has been finalized. You must revert loading before editing inventory entries.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit inventory entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit inventory entries.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Revert Loading Summary (Un-finalize)
-- ---------------------------------------------------------------------------

create or replace function public.revert_loading_summary(
  p_summary_id uuid
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can revert loading summaries.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft reports can have loading reverted.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is null then
    raise exception 'Loading has not been finalized yet.' using errcode = 'P0001';
  end if;

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  -- Return inventory for each loading entry
  for v_entry in 
    select product_id, loading_qty 
    from public.report_inventory_entries 
    where daily_report_id = p_summary_id and loading_qty > 0
  loop
    -- Upsert and return stock
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity + v_entry.loading_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, v_entry.loading_qty, 'LOAD_OUT_REVERT', p_summary_id, actor_id
    );
  end loop;

  -- Update report
  update public.daily_reports
  set
    loading_completed_at = null,
    loading_completed_by = null
  where id = p_summary_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reopen Daily Report (Revert Returns)
-- ---------------------------------------------------------------------------

create or replace function public.reopen_daily_report(target_report_id uuid)
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
  v_entry record;
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

  if current_report.status = 'draft' then
    raise exception 'Draft reports are already open.' using errcode = 'P0001';
  end if;

  if current_report.status = 'approved' and actor_role <> 'admin' then
    raise exception 'Only admin can reopen approved reports.' using errcode = '42501';
  end if;

  if current_report.status in ('submitted', 'rejected') and actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can reopen submitted or rejected reports.' using errcode = '42501';
  end if;

  -- If returning from 'approved', we must REVERT the lorry returns from main_inventory
  if current_report.status = 'approved' then
    -- Get organization_id from route_program
    select organization_id into v_org_id
    from public.route_programs
    where id = current_report.route_program_id;

    for v_entry in 
      select product_id, lorry_qty 
      from public.report_inventory_entries 
      where daily_report_id = target_report_id and lorry_qty > 0
    loop
      -- Upsert and DEDUCT returned stock
      insert into public.main_inventory (organization_id, product_id, quantity)
      values (v_org_id, v_entry.product_id, -v_entry.lorry_qty)
      on conflict (organization_id, product_id)
      do update set quantity = public.main_inventory.quantity - v_entry.lorry_qty, updated_at = timezone('utc', now());

      -- Log transaction
      insert into public.inventory_transactions (
        organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
      ) values (
        v_org_id, v_entry.product_id, -v_entry.lorry_qty, 'LORRY_RETURN_REVERT', target_report_id, actor_id
      );
    end loop;
  end if;

  update public.daily_reports
  set
    status = 'draft',
    submitted_at = null,
    submitted_by = null,
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

-- ---------------------------------------------------------------------------
-- 5. Manual Main Inventory Adjustment
-- ---------------------------------------------------------------------------

create or replace function public.adjust_main_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity_change integer,
  p_notes text default null
)
returns public.main_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  v_new_inventory public.main_inventory%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can manually adjust inventory.' using errcode = '42501';
  end if;

  if p_quantity_change = 0 then
    raise exception 'Quantity change must be non-zero.' using errcode = 'P0001';
  end if;

  -- Upsert into main_inventory
  insert into public.main_inventory (organization_id, product_id, quantity)
  values (p_organization_id, p_product_id, p_quantity_change)
  on conflict (organization_id, product_id)
  do update set quantity = public.main_inventory.quantity + p_quantity_change, updated_at = timezone('utc', now())
  returning * into v_new_inventory;

  -- Log transaction
  insert into public.inventory_transactions (
    organization_id, product_id, quantity_change, transaction_type, notes, created_by
  ) values (
    p_organization_id, p_product_id, p_quantity_change, 'ADJUSTMENT', p_notes, actor_id
  );

  return v_new_inventory;
end;
$$;

commit;



-- ============================================================================
-- supabase/migrations/0028_optimize_daily_reports_rls.sql
-- ============================================================================

begin;

-- Replace self-referential RLS policies on daily_reports to massively improve query performance.
-- The previous policies used security definer functions (can_view_daily_report, can_manage_daily_report) 
-- that performed a self-lookup on daily_reports for EVERY row evaluated, causing O(N^2) complexity.
-- By inlining the rules using the stable role-check functions, the Postgres planner can evaluate
-- the roles exactly once per query, dropping query times from seconds down to milliseconds.

drop policy if exists daily_reports_select_policy on public.daily_reports;
create policy daily_reports_select_policy
on public.daily_reports
for select
to authenticated
using (
  public.is_admin()
  or public.is_supervisor()
  or public.is_cashier()
  or prepared_by = auth.uid()
);

drop policy if exists daily_reports_update_policy on public.daily_reports;
create policy daily_reports_update_policy
on public.daily_reports
for update
to authenticated
using (
  public.is_admin()
  or public.is_supervisor()
  or prepared_by = auth.uid()
)
with check (
  public.is_admin()
  or public.is_supervisor()
  or prepared_by = auth.uid()
);

commit;



-- ============================================================================
-- supabase/migrations/0029_ambewela_product_price_seed.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0030_ambewela_route_program_seed.sql
-- ============================================================================

begin;

alter table public.route_programs enable row level security;

-- Seed/update the Ambewela route program used by Priyadarshana Distributors.
-- day_of_week follows ISO numbering: 1 Monday through 7 Sunday.
with route_list (
  territory_name,
  day_of_week,
  frequency_label,
  route_name,
  route_description,
  is_active
) as (
  values
    ('ELPITIYA', 1, '2x', 'ELPITIYA TOWN', 'Ambewela route program - Monday', true),
    ('ELPITIYA', 2, '1x', 'IGALKANDA,KURUDUGAHA UPTO BATAPOLA JUNCTION', 'Ambewela route program - Tuesday', true),
    ('ELPITIYA', 3, '1x', 'THANABADDEGAMA,KAHADUWA,THALGASWALA UPTO PITOGALA', 'Ambewela route program - Wednesday', true),
    ('ELPITIYA', 4, '1x', 'BATAPOLA JUNCTION,BADDEGAMA BRIDGE UPTO GONAPINUWALA JUNCTION', 'Ambewela route program - Thursday', true),
    ('ELPITIYA', 5, '2x', 'ELPITIYA TOWN', 'Ambewela route program - Friday', true),
    ('ELPITIYA', 6, '1x', 'ELPITIYA UP TO PITIGALA', 'Ambewela route program - Saturday', true)
),
target_organization as (
  select id
  from public.organizations
  order by created_at asc
  limit 1
),
updated_routes as (
  update public.route_programs rp
  set
    frequency_label = route_list.frequency_label,
    route_description = route_list.route_description,
    is_active = route_list.is_active,
    updated_at = timezone('utc', now())
  from route_list
  cross join target_organization
  where rp.organization_id = target_organization.id
    and upper(trim(rp.territory_name)) = route_list.territory_name
    and rp.day_of_week = route_list.day_of_week
    and upper(trim(rp.route_name)) = route_list.route_name
  returning
    rp.organization_id,
    upper(trim(rp.territory_name)) as territory_name,
    rp.day_of_week,
    upper(trim(rp.route_name)) as route_name
)
insert into public.route_programs (
  organization_id,
  territory_name,
  day_of_week,
  frequency_label,
  route_name,
  route_description,
  is_active
)
select
  target_organization.id,
  route_list.territory_name,
  route_list.day_of_week,
  route_list.frequency_label,
  route_list.route_name,
  route_list.route_description,
  route_list.is_active
from route_list
cross join target_organization
where not exists (
  select 1
  from updated_routes ur
  where ur.organization_id = target_organization.id
    and ur.territory_name = route_list.territory_name
    and ur.day_of_week = route_list.day_of_week
    and ur.route_name = route_list.route_name
)
and not exists (
  select 1
  from public.route_programs rp
  where rp.organization_id = target_organization.id
    and upper(trim(rp.territory_name)) = route_list.territory_name
    and rp.day_of_week = route_list.day_of_week
    and upper(trim(rp.route_name)) = route_list.route_name
);

commit;



-- ============================================================================
-- supabase/migrations/0031_distributor_profit_tracking.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0032_temp_main_inventory_opening_stock_seed.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0033_enforce_cash_balanced_report_submit.sql
-- ============================================================================

begin;

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
  invoice_entry_count bigint := 0;
  positive_denomination_count bigint := 0;
  requires_cash_check boolean := false;
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

  if current_report.status <> 'draft' then
    raise exception 'Only draft reports can be submitted.' using errcode = 'P0001';
  end if;

  if actor_role not in ('admin', 'supervisor') and current_report.prepared_by <> actor_id then
    raise exception 'Only the report owner, supervisor, or admin can submit this report.' using errcode = '42501';
  end if;

  select count(*)
  into invoice_entry_count
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_report_id;

  if invoice_entry_count = 0 then
    raise exception 'Add at least one invoice entry before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count is null
     or current_report.delivered_bill_count is null
     or current_report.cancelled_bill_count is null then
    raise exception 'Total, delivered, and cancel bill counts must be provided before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count <= 0 then
    raise exception 'Total bill count must be greater than zero before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.delivered_bill_count + current_report.cancelled_bill_count > current_report.total_bill_count then
    raise exception 'Delivered and cancel bill counts cannot exceed total bill count.' using errcode = '23514';
  end if;

  requires_cash_check :=
    current_report.total_cash > 0
    or current_report.cash_in_hand > 0
    or current_report.cash_physical_total > 0;

  if requires_cash_check then
    select count(*)
    into positive_denomination_count
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_report_id
      and rcd.note_count > 0;

    if positive_denomination_count = 0 then
      raise exception 'Record denomination counts with at least one positive note count before submitting the DATE report.' using errcode = '23514';
    end if;

    if abs(coalesce(current_report.cash_difference, 0)) >= 0.01 then
      raise exception 'Cash reconciliation must be balanced before submitting the DATE report.' using errcode = '23514';
    end if;
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
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

comment on function public.submit_daily_report(uuid) is 'Transitions a daily report from draft to submitted after validating DATE completeness and balanced cash handover.';

grant execute on function public.submit_daily_report(uuid) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0034_prevent_negative_stock_on_loading_finalize.sql
-- ============================================================================

begin;

create or replace function public.finalize_loading_summary(
  p_summary_id uuid,
  p_loading_notes text default null
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
  v_available_qty integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft loading summaries can be finalized.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is not null then
    raise exception 'Loading has already been finalized.' using errcode = 'P0001';
  end if;

  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  if v_org_id is null then
    raise exception 'Route organization was not found for this loading summary.' using errcode = 'P0002';
  end if;

  for v_entry in
    select
      rie.product_id,
      rie.loading_qty,
      coalesce(rie.product_display_name_snapshot, rie.product_name_snapshot, rie.product_code_snapshot) as product_label
    from public.report_inventory_entries rie
    where rie.daily_report_id = p_summary_id
      and rie.loading_qty > 0
  loop
    select coalesce(mi.quantity, 0)
    into v_available_qty
    from public.main_inventory mi
    where mi.organization_id = v_org_id
      and mi.product_id = v_entry.product_id
    for update;

    v_available_qty := coalesce(v_available_qty, 0);

    if v_available_qty < v_entry.loading_qty then
      raise exception 'Insufficient main stock for %. Available %, requested %.',
        v_entry.product_label,
        v_available_qty,
        v_entry.loading_qty
        using errcode = '23514';
    end if;
  end loop;

  for v_entry in
    select product_id, loading_qty
    from public.report_inventory_entries
    where daily_report_id = p_summary_id
      and loading_qty > 0
  loop
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, -v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set
      quantity = public.main_inventory.quantity - v_entry.loading_qty,
      updated_at = timezone('utc', now());

    insert into public.inventory_transactions (
      organization_id,
      product_id,
      quantity_change,
      transaction_type,
      reference_id,
      created_by
    ) values (
      v_org_id,
      v_entry.product_id,
      -v_entry.loading_qty,
      'LOAD_OUT',
      p_summary_id,
      actor_id
    );
  end loop;

  update public.daily_reports
  set
    loading_completed_at = timezone('utc', now()),
    loading_completed_by = actor_id,
    loading_notes = coalesce(p_loading_notes, v_report.loading_notes)
  where id = p_summary_id
  returning * into v_report;

  return v_report;
end;
$$;

comment on function public.finalize_loading_summary(uuid, text) is 'Finalizes loading after confirming main inventory has enough stock, then deducts loaded quantities.';

commit;



-- ============================================================================
-- supabase/migrations/0035_standardize_quantities_to_selling_units.sql
-- ============================================================================

begin;

-- Align operational quantities with the Ambewela Flat Data convention:
-- quantities are individual selling units, while pack_size remains packaging metadata.
update public.products
set
  quantity_entry_mode = 'unit',
  updated_at = timezone('utc', now())
where is_active = true
  and quantity_entry_mode <> 'unit';

alter table public.report_inventory_entries
  add column if not exists costed_sales_qty_snapshot integer not null default 0;

alter table public.report_inventory_entries
  drop constraint if exists report_inventory_entries_costed_sales_qty_snapshot_check;

alter table public.report_inventory_entries
  add constraint report_inventory_entries_costed_sales_qty_snapshot_check
  check (
    costed_sales_qty_snapshot >= 0
    and costed_sales_qty_snapshot <= sales_qty
  );

alter table public.report_inventory_entries disable trigger guard_report_inventory_entry_mutations;

update public.report_inventory_entries
set costed_sales_qty_snapshot = coalesce(sales_qty, 0)
where costed_sales_qty_snapshot = 0
  and coalesce(sales_qty, 0) > 0;

alter table public.report_inventory_entries enable trigger guard_report_inventory_entry_mutations;

alter table public.report_inventory_entries
  drop column if exists gross_profit_snapshot;

alter table public.report_inventory_entries
  add column gross_profit_snapshot numeric(14,2)
  generated always as (
    round(coalesce(sales_revenue_snapshot, 0) - (coalesce(costed_sales_qty_snapshot, 0) * coalesce(distributor_price_snapshot, 0)), 2)
  ) stored;

comment on column public.report_inventory_entries.costed_sales_qty_snapshot is
  'Sold quantity that should carry distributor cost for profit. Imported free-issue/full-discount rows remain in sales_qty but are excluded here.';

comment on column public.report_inventory_entries.gross_profit_snapshot is
  'Distributor gross profit: sales revenue less distributor cost for costed sold quantity.';

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
  entry_costed_sales_qty integer;
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
    entry_costed_sales_qty := case
      when entry ? 'costedSalesQty' and nullif(entry ->> 'costedSalesQty', '') is not null then (entry ->> 'costedSalesQty')::integer
      else entry_sales_qty
    end;
    entry_sales_revenue := case
      when entry ? 'salesRevenue' and nullif(entry ->> 'salesRevenue', '') is not null then (entry ->> 'salesRevenue')::numeric
      else null
    end;

    if entry_product_id is null then
      raise exception 'Each inventory entry must include productId.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 or entry_costed_sales_qty < 0 then
      raise exception 'Inventory quantities must be non-negative.' using errcode = '23514';
    end if;

    if entry_costed_sales_qty > entry_sales_qty then
      raise exception 'costedSalesQty cannot exceed salesQty.' using errcode = '23514';
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
    entry_costed_sales_qty := case
      when entry ? 'costedSalesQty' and nullif(entry ->> 'costedSalesQty', '') is not null then (entry ->> 'costedSalesQty')::integer
      else entry_sales_qty
    end;
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
      sales_revenue_snapshot,
      costed_sales_qty_snapshot
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
      entry_sales_revenue,
      entry_costed_sales_qty
    );
  end loop;

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

comment on function public.save_report_inventory_entries(uuid, jsonb) is
  'Atomically replaces a report inventory set with unit quantities, product-level revenue, and distributor-costed sales quantity.';

commit;



-- ============================================================================
-- supabase/migrations/0036_business_workflow_hardening.sql
-- ============================================================================

begin;

-- Production hardening for the distributor workflow.
-- This migration keeps the app organization-scoped, adds role defaults plus
-- per-user feature overrides, and makes the critical handover RPCs enforce
-- the same business rules used by the UI.

create table if not exists public.feature_permissions (
  role text not null check (role in ('admin', 'supervisor', 'driver', 'cashier')),
  feature_key text not null,
  action_key text not null,
  is_allowed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (role, feature_key, action_key)
);

create table if not exists public.user_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  action_key text not null,
  effect text not null check (effect in ('allow', 'deny')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id, feature_key, action_key)
);

drop trigger if exists set_feature_permissions_updated_at on public.feature_permissions;
create trigger set_feature_permissions_updated_at
before update on public.feature_permissions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_user_feature_overrides_updated_at on public.user_feature_overrides;
create trigger set_user_feature_overrides_updated_at
before update on public.user_feature_overrides
for each row execute procedure public.set_updated_at();

alter table public.feature_permissions enable row level security;
alter table public.user_feature_overrides enable row level security;

drop policy if exists feature_permissions_select_policy on public.feature_permissions;
create policy feature_permissions_select_policy
on public.feature_permissions
for select
to authenticated
using (public.has_active_profile());

drop policy if exists user_feature_overrides_select_policy on public.user_feature_overrides;
create policy user_feature_overrides_select_policy
on public.user_feature_overrides
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.is_supervisor()
);

drop policy if exists user_feature_overrides_write_policy on public.user_feature_overrides;
create policy user_feature_overrides_write_policy
on public.user_feature_overrides
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

with
features(feature_key) as (
  values
    ('dashboard'),
    ('daily_reports'),
    ('date_sheet'),
    ('loading_summaries'),
    ('main_inventory'),
    ('products'),
    ('route_programs'),
    ('customers'),
    ('users'),
    ('settings'),
    ('analytics')
),
actions(action_key) as (
  values
    ('view'),
    ('create'),
    ('edit'),
    ('delete'),
    ('submit'),
    ('approve'),
    ('reopen'),
    ('import'),
    ('receive_stock'),
    ('view_costs'),
    ('edit_costs')
),
all_admin as (
  select 'admin'::text as role, feature_key, action_key, true as is_allowed
  from features cross join actions
),
supervisor_allowed(role, feature_key, action_key, is_allowed) as (
  values
    ('supervisor','dashboard','view',true),
    ('supervisor','daily_reports','view',true),
    ('supervisor','daily_reports','create',true),
    ('supervisor','daily_reports','edit',true),
    ('supervisor','daily_reports','submit',true),
    ('supervisor','daily_reports','approve',true),
    ('supervisor','daily_reports','reopen',true),
    ('supervisor','date_sheet','view',true),
    ('supervisor','date_sheet','edit',true),
    ('supervisor','date_sheet','submit',true),
    ('supervisor','date_sheet','import',true),
    ('supervisor','loading_summaries','view',true),
    ('supervisor','loading_summaries','create',true),
    ('supervisor','loading_summaries','edit',true),
    ('supervisor','loading_summaries','submit',true),
    ('supervisor','main_inventory','view',true),
    ('supervisor','main_inventory','receive_stock',true),
    ('supervisor','products','view',true),
    ('supervisor','products','create',true),
    ('supervisor','products','edit',true),
    ('supervisor','route_programs','view',true),
    ('supervisor','route_programs','create',true),
    ('supervisor','route_programs','edit',true),
    ('supervisor','customers','view',true),
    ('supervisor','customers','create',true),
    ('supervisor','customers','edit',true),
    ('supervisor','analytics','view',true)
),
driver_allowed(role, feature_key, action_key, is_allowed) as (
  values
    ('driver','dashboard','view',true),
    ('driver','daily_reports','view',true),
    ('driver','daily_reports','create',true),
    ('driver','daily_reports','edit',true),
    ('driver','daily_reports','submit',true),
    ('driver','date_sheet','view',true),
    ('driver','date_sheet','edit',true),
    ('driver','date_sheet','submit',true),
    ('driver','loading_summaries','view',true),
    ('driver','loading_summaries','create',true),
    ('driver','loading_summaries','edit',true),
    ('driver','loading_summaries','submit',true),
    ('driver','products','view',true),
    ('driver','route_programs','view',true),
    ('driver','customers','view',true)
),
cashier_allowed(role, feature_key, action_key, is_allowed) as (
  values
    ('cashier','dashboard','view',true),
    ('cashier','daily_reports','view',true),
    ('cashier','date_sheet','view',true),
    ('cashier','date_sheet','edit',true),
    ('cashier','products','view',true),
    ('cashier','route_programs','view',true),
    ('cashier','customers','view',true)
),
role_defaults as (
  select * from all_admin
  union all select * from supervisor_allowed
  union all select * from driver_allowed
  union all select * from cashier_allowed
)
insert into public.feature_permissions (role, feature_key, action_key, is_allowed)
select role, feature_key, action_key, is_allowed
from role_defaults
on conflict (role, feature_key, action_key)
do update set is_allowed = excluded.is_allowed;

create or replace function public.current_user_active_organization_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(om.organization_id order by om.created_at asc), '{}'::uuid[])
  from public.organization_memberships om
  join public.profiles p on p.id = om.user_id
  where om.user_id = auth.uid()
    and om.status = 'ACTIVE'
    and p.is_active = true;
$$;

create or replace function public.user_has_org_access(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_org_id = any(public.current_user_active_organization_ids());
$$;

create or replace function public.user_has_feature_permission(
  feature_key text,
  action_key text,
  target_org_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select p.id, p.role
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'supervisor', 'driver', 'cashier')
  ),
  org_check as (
    select (
      target_org_id is null
      or exists (
        select 1
        from public.organization_memberships om
        join actor on actor.id = om.user_id
        where om.organization_id = target_org_id
          and om.status = 'ACTIVE'
      )
    ) as allowed
  ),
  override as (
    select ufo.effect
    from public.user_feature_overrides ufo
    join actor on actor.id = ufo.user_id
    where ufo.feature_key = $1
      and ufo.action_key = $2
      and ($3 is null or ufo.organization_id = $3)
    order by case ufo.effect when 'deny' then 0 else 1 end
    limit 1
  )
  select coalesce((
    select case
      when not org_check.allowed then false
      when exists (select 1 from override where effect = 'deny') then false
      when exists (select 1 from override where effect = 'allow') then true
      else coalesce(fp.is_allowed, false)
    end
    from actor
    cross join org_check
    left join public.feature_permissions fp
      on fp.role = actor.role
     and fp.feature_key = $1
     and fp.action_key = $2
  ), false);
$$;

create or replace function public.report_organization_id(target_report_id uuid)
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

create or replace function public.can_view_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    join public.route_programs rp on rp.id = dr.route_program_id
    where dr.id = target_report_id
      and dr.deleted_at is null
      and public.user_has_feature_permission('daily_reports', 'view', rp.organization_id)
      and (
        public.current_user_role() in ('admin', 'supervisor', 'cashier')
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_daily_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    join public.route_programs rp on rp.id = dr.route_program_id
    where dr.id = target_report_id
      and dr.deleted_at is null
      and dr.status = 'draft'
      and public.user_has_feature_permission('daily_reports', 'edit', rp.organization_id)
      and (
        public.current_user_role() in ('admin', 'supervisor')
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.can_manage_finance_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_reports dr
    join public.route_programs rp on rp.id = dr.route_program_id
    where dr.id = target_report_id
      and dr.deleted_at is null
      and dr.status = 'draft'
      and public.user_has_feature_permission('date_sheet', 'edit', rp.organization_id)
      and (
        public.current_user_role() in ('admin', 'supervisor', 'cashier')
        or dr.prepared_by = auth.uid()
      )
  );
$$;

create or replace function public.assert_daily_report_inventory_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.report_organization_id(target_daily_report_id) into org_id;

  if report_row.status <> 'draft' then
    raise exception 'Inventory entries can only be changed while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('daily_reports', 'edit', org_id) then
    raise exception 'Missing permission to edit report inventory.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> auth.uid() then
    raise exception 'Drivers can only edit inventory entries on their own reports.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_daily_report_return_damage_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.report_organization_id(target_daily_report_id) into org_id;

  if report_row.status <> 'draft' then
    raise exception 'Return and damage entries can only be changed while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('daily_reports', 'edit', org_id) then
    raise exception 'Missing permission to edit return and damage entries.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> auth.uid() then
    raise exception 'Drivers can only edit return and damage entries on their own reports.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_daily_report_invoice_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.report_organization_id(target_daily_report_id) into org_id;

  if report_row.status <> 'draft' then
    raise exception 'Invoice entries can only be changed while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'edit', org_id) then
    raise exception 'Missing permission to edit DATE invoice entries.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> auth.uid() then
    raise exception 'Drivers can only edit invoice entries on their own reports.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_daily_report_expenses_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.report_organization_id(target_daily_report_id) into org_id;

  if report_row.status <> 'draft' then
    raise exception 'Expenses can only be changed while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'edit', org_id) then
    raise exception 'Missing permission to edit DATE expenses.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> auth.uid() then
    raise exception 'Drivers can only edit expenses on their own reports.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_daily_report_cash_denominations_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select public.report_organization_id(target_daily_report_id) into org_id;

  if report_row.status <> 'draft' then
    raise exception 'Cash denominations can only be changed while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'edit', org_id) then
    raise exception 'Missing permission to edit DATE cash denominations.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> auth.uid() then
    raise exception 'Drivers can only edit cash denominations on their own reports.' using errcode = '42501';
  end if;
end;
$$;

-- Add the missing transaction type used when an approved report is reopened.
alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check check (
    transaction_type in ('RECEIPT', 'LOAD_OUT', 'LORRY_RETURN', 'LORRY_RETURN_REVERT', 'ADJUSTMENT')
  );

comment on column public.main_inventory.quantity is 'Current main inventory stock in mother-company selling units.';
comment on column public.inventory_transactions.quantity_change is 'Inventory movement quantity in mother-company selling units.';

create table if not exists public.driver_deductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  missing_qty integer not null check (missing_qty > 0),
  unit_price_snapshot numeric(12,2) not null default 0 check (unit_price_snapshot >= 0),
  deduction_amount numeric(14,2) generated always as (round(missing_qty * unit_price_snapshot, 2)) stored,
  reason text not null default 'Missing lorry stock after route reconciliation',
  status text not null default 'pending' check (status in ('pending', 'approved', 'waived', 'settled')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  waived_by uuid references public.profiles(id) on delete set null,
  waived_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (daily_report_id, product_id)
);

drop trigger if exists set_driver_deductions_updated_at on public.driver_deductions;
create trigger set_driver_deductions_updated_at
before update on public.driver_deductions
for each row execute procedure public.set_updated_at();

alter table public.driver_deductions enable row level security;

drop policy if exists driver_deductions_select_policy on public.driver_deductions;
create policy driver_deductions_select_policy
on public.driver_deductions
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and (
    public.user_has_feature_permission('daily_reports', 'approve', organization_id)
    or driver_id = auth.uid()
  )
);

drop policy if exists driver_deductions_write_policy on public.driver_deductions;
create policy driver_deductions_write_policy
on public.driver_deductions
for all
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('daily_reports', 'approve', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('daily_reports', 'approve', organization_id)
);

create or replace function public.sync_driver_deductions_for_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
begin
  select *
  into v_report
  from public.daily_reports
  where id = target_report_id
    and deleted_at is null;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select organization_id
  into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  if v_org_id is null then
    raise exception 'Route organization was not found for this report.' using errcode = 'P0002';
  end if;

  insert into public.driver_deductions (
    organization_id,
    daily_report_id,
    driver_id,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    missing_qty,
    unit_price_snapshot,
    reason,
    status
  )
  select
    v_org_id,
    target_report_id,
    v_report.prepared_by,
    rie.product_id,
    rie.product_code_snapshot,
    coalesce(rie.product_display_name_snapshot, rie.product_name_snapshot),
    abs(rie.variance_qty),
    rie.unit_price_snapshot,
    'Missing lorry stock after route reconciliation',
    'pending'
  from public.report_inventory_entries rie
  where rie.daily_report_id = target_report_id
    and rie.variance_qty < 0
  on conflict (daily_report_id, product_id)
  do update set
    organization_id = excluded.organization_id,
    driver_id = excluded.driver_id,
    product_code_snapshot = excluded.product_code_snapshot,
    product_name_snapshot = excluded.product_name_snapshot,
    missing_qty = excluded.missing_qty,
    unit_price_snapshot = excluded.unit_price_snapshot,
    reason = excluded.reason,
    status = case
      when public.driver_deductions.status in ('settled') then public.driver_deductions.status
      when public.driver_deductions.missing_qty <> excluded.missing_qty
        or public.driver_deductions.unit_price_snapshot <> excluded.unit_price_snapshot then 'pending'
      else public.driver_deductions.status
    end,
    approved_by = case
      when public.driver_deductions.missing_qty <> excluded.missing_qty
        or public.driver_deductions.unit_price_snapshot <> excluded.unit_price_snapshot then null
      else public.driver_deductions.approved_by
    end,
    approved_at = case
      when public.driver_deductions.missing_qty <> excluded.missing_qty
        or public.driver_deductions.unit_price_snapshot <> excluded.unit_price_snapshot then null
      else public.driver_deductions.approved_at
    end,
    waived_by = case
      when public.driver_deductions.missing_qty <> excluded.missing_qty
        or public.driver_deductions.unit_price_snapshot <> excluded.unit_price_snapshot then null
      else public.driver_deductions.waived_by
    end,
    waived_at = case
      when public.driver_deductions.missing_qty <> excluded.missing_qty
        or public.driver_deductions.unit_price_snapshot <> excluded.unit_price_snapshot then null
      else public.driver_deductions.waived_at
    end,
    updated_at = timezone('utc', now());

  delete from public.driver_deductions dd
  where dd.daily_report_id = target_report_id
    and dd.status <> 'settled'
    and not exists (
      select 1
      from public.report_inventory_entries rie
      where rie.daily_report_id = dd.daily_report_id
        and rie.product_id = dd.product_id
        and rie.variance_qty < 0
    );
end;
$$;

create or replace function public.resolve_driver_deduction(
  target_deduction_id uuid,
  target_status text,
  resolution_reason text default null
)
returns public.driver_deductions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  deduction_row public.driver_deductions%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into deduction_row
  from public.driver_deductions
  where id = target_deduction_id
  for update;

  if not found then
    raise exception 'Driver deduction not found.' using errcode = 'P0002';
  end if;

  if target_status not in ('approved', 'waived', 'settled') then
    raise exception 'Driver deduction can only be approved, waived, or settled.' using errcode = '23514';
  end if;

  if not public.user_has_feature_permission('daily_reports', 'approve', deduction_row.organization_id) then
    raise exception 'Missing permission to resolve driver deductions.' using errcode = '42501';
  end if;

  update public.driver_deductions
  set
    status = target_status,
    reason = coalesce(nullif(trim(resolution_reason), ''), reason),
    approved_by = case when target_status = 'approved' then actor_id else approved_by end,
    approved_at = case when target_status = 'approved' then timezone('utc', now()) else approved_at end,
    waived_by = case when target_status = 'waived' then actor_id else waived_by end,
    waived_at = case when target_status = 'waived' then timezone('utc', now()) else waived_at end,
    settled_at = case when target_status = 'settled' then timezone('utc', now()) else settled_at end
  where id = target_deduction_id
  returning * into deduction_row;

  return deduction_row;
end;
$$;

-- Org and feature-scoped policies.
drop policy if exists products_access_by_membership on public.products;
drop policy if exists products_select_policy on public.products;
drop policy if exists products_insert_policy on public.products;
drop policy if exists products_update_policy on public.products;
drop policy if exists products_delete_policy on public.products;

create policy products_select_policy
on public.products
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('products', 'view', organization_id)
);

create policy products_insert_policy
on public.products
for insert
to authenticated
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('products', 'create', organization_id)
);

create policy products_update_policy
on public.products
for update
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('products', 'edit', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('products', 'edit', organization_id)
);

create policy products_delete_policy
on public.products
for delete
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('products', 'delete', organization_id)
);

drop policy if exists route_programs_select_policy on public.route_programs;
drop policy if exists route_programs_insert_policy on public.route_programs;
drop policy if exists route_programs_update_policy on public.route_programs;
drop policy if exists route_programs_delete_policy on public.route_programs;

create policy route_programs_select_policy
on public.route_programs
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('route_programs', 'view', organization_id)
);

create policy route_programs_insert_policy
on public.route_programs
for insert
to authenticated
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('route_programs', 'create', organization_id)
);

create policy route_programs_update_policy
on public.route_programs
for update
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('route_programs', 'edit', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('route_programs', 'edit', organization_id)
);

create policy route_programs_delete_policy
on public.route_programs
for delete
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('route_programs', 'delete', organization_id)
);

drop policy if exists customers_access_by_membership on public.customers;
drop policy if exists customers_select_policy on public.customers;
drop policy if exists customers_insert_policy on public.customers;
drop policy if exists customers_update_policy on public.customers;
drop policy if exists customers_delete_policy on public.customers;

create policy customers_select_policy
on public.customers
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'view', organization_id)
);

create policy customers_insert_policy
on public.customers
for insert
to authenticated
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'create', organization_id)
);

create policy customers_update_policy
on public.customers
for update
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
);

create policy customers_delete_policy
on public.customers
for delete
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'delete', organization_id)
);

drop policy if exists expense_categories_select_policy on public.expense_categories;
drop policy if exists expense_categories_insert_policy on public.expense_categories;
drop policy if exists expense_categories_update_policy on public.expense_categories;
drop policy if exists expense_categories_delete_policy on public.expense_categories;

create policy expense_categories_select_policy
on public.expense_categories
for select
to authenticated
using (public.user_has_feature_permission('date_sheet', 'view', null));

create policy expense_categories_insert_policy
on public.expense_categories
for insert
to authenticated
with check (public.user_has_feature_permission('date_sheet', 'edit', null));

create policy expense_categories_update_policy
on public.expense_categories
for update
to authenticated
using (public.user_has_feature_permission('date_sheet', 'edit', null))
with check (public.user_has_feature_permission('date_sheet', 'edit', null));

create policy expense_categories_delete_policy
on public.expense_categories
for delete
to authenticated
using (public.user_has_feature_permission('date_sheet', 'edit', null));

drop policy if exists main_inventory_select_policy on public.main_inventory;
drop policy if exists main_inventory_insert_policy on public.main_inventory;
drop policy if exists main_inventory_update_policy on public.main_inventory;

create policy main_inventory_select_policy
on public.main_inventory
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'view', organization_id)
);

create policy main_inventory_insert_policy
on public.main_inventory
for insert
to authenticated
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'receive_stock', organization_id)
);

create policy main_inventory_update_policy
on public.main_inventory
for update
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'receive_stock', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'receive_stock', organization_id)
);

drop policy if exists inventory_transactions_select_policy on public.inventory_transactions;
drop policy if exists inventory_transactions_insert_policy on public.inventory_transactions;

create policy inventory_transactions_select_policy
on public.inventory_transactions
for select
to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'view', organization_id)
);

create policy inventory_transactions_insert_policy
on public.inventory_transactions
for insert
to authenticated
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('main_inventory', 'receive_stock', organization_id)
);

drop policy if exists daily_reports_select_policy on public.daily_reports;
drop policy if exists daily_reports_insert_policy on public.daily_reports;
drop policy if exists daily_reports_update_policy on public.daily_reports;
drop policy if exists daily_reports_delete_policy on public.daily_reports;

create policy daily_reports_select_policy
on public.daily_reports
for select
to authenticated
using (public.can_view_daily_report(id));

create policy daily_reports_insert_policy
on public.daily_reports
for insert
to authenticated
with check (
  exists (
    select 1
    from public.route_programs rp
    where rp.id = route_program_id
      and (
        public.user_has_feature_permission('loading_summaries', 'create', rp.organization_id)
        or public.user_has_feature_permission('daily_reports', 'create', rp.organization_id)
      )
      and public.user_has_org_access(rp.organization_id)
  )
  and prepared_by = auth.uid()
);

create policy daily_reports_update_policy
on public.daily_reports
for update
to authenticated
using (
  public.can_manage_daily_report(id)
  or public.can_manage_finance_report(id)
)
with check (
  public.can_view_daily_report(id)
);

create policy daily_reports_delete_policy
on public.daily_reports
for delete
to authenticated
using (
  public.user_has_feature_permission('daily_reports', 'delete', public.report_organization_id(id))
);

create or replace function public.receive_main_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns public.main_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_new_inventory public.main_inventory%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.user_has_feature_permission('main_inventory', 'receive_stock', p_organization_id) then
    raise exception 'Missing permission to receive main inventory stock.' using errcode = '42501';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero selling units.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.organization_id = p_organization_id
      and p.is_active = true
  ) then
    raise exception 'Product does not belong to this organization or is inactive.' using errcode = '23503';
  end if;

  insert into public.main_inventory (organization_id, product_id, quantity)
  values (p_organization_id, p_product_id, p_quantity)
  on conflict (organization_id, product_id)
  do update set
    quantity = public.main_inventory.quantity + p_quantity,
    updated_at = timezone('utc', now())
  returning * into v_new_inventory;

  insert into public.inventory_transactions (
    organization_id, product_id, quantity_change, transaction_type, notes, created_by
  ) values (
    p_organization_id, p_product_id, p_quantity, 'RECEIPT',
    coalesce(nullif(trim(p_notes), ''), 'Received main inventory stock in selling units'),
    actor_id
  );

  return v_new_inventory;
end;
$$;

create or replace function public.finalize_loading_summary(
  p_summary_id uuid,
  p_loading_notes text default null
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
  v_available_qty integer := 0;
  v_positive_lines bigint := 0;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  if v_org_id is null then
    raise exception 'Route organization was not found for this loading summary.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('loading_summaries', 'submit', v_org_id) then
    raise exception 'Missing permission to finalize loading summaries.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and v_report.prepared_by <> actor_id then
    raise exception 'Drivers can only finalize their own loading summaries.' using errcode = '42501';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft loading summaries can be finalized.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is not null then
    raise exception 'Loading has already been finalized.' using errcode = 'P0001';
  end if;

  select count(*)
  into v_positive_lines
  from public.report_inventory_entries rie
  where rie.daily_report_id = p_summary_id
    and rie.loading_qty > 0;

  if v_positive_lines = 0 then
    raise exception 'Add at least one positive loading line before finalizing.' using errcode = '23514';
  end if;

  for v_entry in
    select
      rie.product_id,
      rie.loading_qty,
      coalesce(rie.product_display_name_snapshot, rie.product_name_snapshot, rie.product_code_snapshot) as product_label
    from public.report_inventory_entries rie
    where rie.daily_report_id = p_summary_id
      and rie.loading_qty > 0
  loop
    select coalesce(mi.quantity, 0)
    into v_available_qty
    from public.main_inventory mi
    where mi.organization_id = v_org_id
      and mi.product_id = v_entry.product_id
    for update;

    v_available_qty := coalesce(v_available_qty, 0);

    if v_available_qty < v_entry.loading_qty then
      raise exception 'Insufficient main stock for %. Available %, requested % selling units.',
        v_entry.product_label,
        v_available_qty,
        v_entry.loading_qty
        using errcode = '23514';
    end if;
  end loop;

  for v_entry in
    select product_id, loading_qty
    from public.report_inventory_entries
    where daily_report_id = p_summary_id
      and loading_qty > 0
  loop
    update public.main_inventory
    set
      quantity = quantity - v_entry.loading_qty,
      updated_at = timezone('utc', now())
    where organization_id = v_org_id
      and product_id = v_entry.product_id;

    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, notes, created_by
    ) values (
      v_org_id, v_entry.product_id, -v_entry.loading_qty, 'LOAD_OUT', p_summary_id,
      'Finalized morning loading in selling units',
      actor_id
    );
  end loop;

  update public.daily_reports
  set
    loading_completed_at = timezone('utc', now()),
    loading_completed_by = actor_id,
    loading_notes = coalesce(p_loading_notes, v_report.loading_notes)
  where id = p_summary_id
  returning * into v_report;

  return v_report;
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
  requires_cash_check boolean := false;
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

  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

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

  select count(*)
  into inventory_entry_count
  from public.report_inventory_entries rie
  where rie.daily_report_id = target_report_id;

  if inventory_entry_count = 0 then
    raise exception 'Add at least one inventory line before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*)
  into invalid_inventory_count
  from public.report_inventory_entries rie
  where rie.daily_report_id = target_report_id
    and (
      rie.sales_qty > rie.loading_qty
      or rie.lorry_qty < 0
    );

  if invalid_inventory_count > 0 then
    raise exception 'Inventory lines contain invalid quantities. Sales cannot exceed loading and counted lorry stock cannot be negative.' using errcode = '23514';
  end if;

  perform public.sync_driver_deductions_for_report(target_report_id);

  select count(*)
  into positive_variance_count
  from public.report_inventory_entries rie
  where rie.daily_report_id = target_report_id
    and rie.variance_qty > 0;

  if positive_variance_count > 0 then
    raise exception 'Positive more-stock variances must be reviewed and corrected before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*)
  into unresolved_missing_count
  from public.driver_deductions dd
  where dd.daily_report_id = target_report_id
    and dd.status = 'pending';

  if unresolved_missing_count > 0 then
    raise exception 'Missing lorry stock was found. Approve or waive the driver deduction before submitting the DATE report.' using errcode = '23514';
  end if;

  select count(*)
  into invoice_entry_count
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_report_id;

  if invoice_entry_count = 0 then
    raise exception 'Add at least one invoice entry before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count is null
     or current_report.delivered_bill_count is null
     or current_report.cancelled_bill_count is null then
    raise exception 'Total, delivered, and cancel bill counts must be provided before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count <= 0 then
    raise exception 'Total bill count must be greater than zero before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.delivered_bill_count + current_report.cancelled_bill_count > current_report.total_bill_count then
    raise exception 'Delivered and cancel bill counts cannot exceed total bill count.' using errcode = '23514';
  end if;

  requires_cash_check :=
    current_report.total_cash > 0
    or current_report.cash_in_hand > 0
    or current_report.cash_physical_total > 0;

  if requires_cash_check then
    select count(*)
    into positive_denomination_count
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_report_id
      and rcd.note_count > 0;

    if positive_denomination_count = 0 then
      raise exception 'Record denomination counts with at least one positive note count before submitting the DATE report.' using errcode = '23514';
    end if;

    if abs(coalesce(current_report.cash_difference, 0)) >= 0.01 then
      raise exception 'Cash reconciliation must be balanced before submitting the DATE report.' using errcode = '23514';
    end if;
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
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

create or replace function public.approve_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
begin
  if actor_id is null or public.current_user_role() is null then
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

  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

  if not public.user_has_feature_permission('daily_reports', 'approve', v_org_id) then
    raise exception 'Missing permission to approve reports.' using errcode = '42501';
  end if;

  if current_report.status <> 'submitted' then
    raise exception 'Only submitted reports can be approved.' using errcode = 'P0001';
  end if;

  for v_entry in
    select product_id, lorry_qty
    from public.report_inventory_entries
    where daily_report_id = target_report_id
      and lorry_qty > 0
  loop
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, v_entry.lorry_qty)
    on conflict (organization_id, product_id)
    do update set
      quantity = public.main_inventory.quantity + v_entry.lorry_qty,
      updated_at = timezone('utc', now());

    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, notes, created_by
    ) values (
      v_org_id, v_entry.product_id, v_entry.lorry_qty, 'LORRY_RETURN', target_report_id,
      'Approved DATE report lorry return in selling units',
      actor_id
    );
  end loop;

  update public.daily_reports
  set
    status = 'approved',
    approved_at = timezone('utc', now()),
    approved_by = actor_id,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

create or replace function public.reopen_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
  v_available_qty integer := 0;
begin
  if actor_id is null or public.current_user_role() is null then
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

  if current_report.status = 'draft' then
    raise exception 'Draft reports are already open.' using errcode = 'P0001';
  end if;

  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

  if not public.user_has_feature_permission('daily_reports', 'reopen', v_org_id) then
    raise exception 'Missing permission to reopen reports.' using errcode = '42501';
  end if;

  if current_report.status = 'approved' and public.current_user_role() <> 'admin' then
    raise exception 'Only admin can reopen approved reports.' using errcode = '42501';
  end if;

  if current_report.status = 'approved' then
    for v_entry in
      select
        product_id,
        lorry_qty,
        coalesce(product_display_name_snapshot, product_name_snapshot, product_code_snapshot) as product_label
      from public.report_inventory_entries
      where daily_report_id = target_report_id
        and lorry_qty > 0
    loop
      select coalesce(mi.quantity, 0)
      into v_available_qty
      from public.main_inventory mi
      where mi.organization_id = v_org_id
        and mi.product_id = v_entry.product_id
      for update;

      v_available_qty := coalesce(v_available_qty, 0);

      if v_available_qty < v_entry.lorry_qty then
        raise exception 'Cannot reopen approved report because main inventory for % is now below the lorry return that must be reverted. Available %, required % selling units.',
          v_entry.product_label,
          v_available_qty,
          v_entry.lorry_qty
          using errcode = '23514';
      end if;
    end loop;

    for v_entry in
      select product_id, lorry_qty
      from public.report_inventory_entries
      where daily_report_id = target_report_id
        and lorry_qty > 0
    loop
      update public.main_inventory
      set
        quantity = quantity - v_entry.lorry_qty,
        updated_at = timezone('utc', now())
      where organization_id = v_org_id
        and product_id = v_entry.product_id;

      insert into public.inventory_transactions (
        organization_id, product_id, quantity_change, transaction_type, reference_id, notes, created_by
      ) values (
        v_org_id, v_entry.product_id, -v_entry.lorry_qty, 'LORRY_RETURN_REVERT', target_report_id,
        'Reopened approved DATE report and reverted lorry return in selling units',
        actor_id
      );
    end loop;
  end if;

  update public.daily_reports
  set
    status = 'draft',
    submitted_at = null,
    submitted_by = null,
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

-- Some test Supabase databases may already have this function with an
-- incompatible return type from an earlier failed/manual hardening attempt.
-- Drop only this function signature before recreating the canonical void
-- version used by triggers and report rollup side effects.
drop function if exists public.recalculate_daily_report_totals(uuid);

create or replace function public.recalculate_daily_report_totals(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_report public.daily_reports%rowtype;
  invoice_totals record;
  expense_total numeric(14,2) := 0;
  cash_physical numeric(14,2) := 0;
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
  into expense_total
  from public.report_expenses
  where daily_report_id = target_daily_report_id;

  select coalesce(sum(line_total), 0)
  into cash_physical
  from public.report_cash_denominations
  where daily_report_id = target_daily_report_id;

  select coalesce(sum(gross_profit_snapshot), 0)
  into distributor_gross_profit
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id;

  update public.daily_reports
  set
    total_cash = coalesce(invoice_totals.cash_total, 0),
    total_cheques = coalesce(invoice_totals.cheque_total, 0),
    total_credit = coalesce(invoice_totals.credit_total, 0),
    total_expenses = coalesce(expense_total, 0),
    day_sale_total = day_sale,
    total_sale = day_sale,
    db_margin_value = public.calculate_db_margin_value(day_sale, db_margin_percent),
    net_profit = round(coalesce(distributor_gross_profit, 0) - coalesce(expense_total, 0), 2),
    cash_book_total = public.calculate_cash_book_total(cash_in_hand, cash_in_bank),
    cash_physical_total = coalesce(cash_physical, 0),
    cash_difference = public.calculate_cash_difference(coalesce(cash_physical, 0), public.calculate_cash_book_total(cash_in_hand, cash_in_bank))
  where id = target_daily_report_id
  returning * into updated_report;
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

create or replace function public.trigger_recalculate_current_daily_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  perform public.recalculate_daily_report_totals(new.id);
  return new;
end;
$$;

create or replace function public.import_flat_data_report(
  target_daily_report_id uuid,
  input_invoice_entries jsonb,
  input_inventory_sales jsonb,
  input_return_damage_entries jsonb,
  input_delivered_bill_count integer,
  allow_overwrite boolean default false
)
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
  item jsonb;
  product_uuid uuid;
  existing_entry public.report_inventory_entries%rowtype;
  existing_data_count bigint := 0;
  line_no_counter integer := 1;
  sales_qty_value integer;
  lorry_qty_value integer;
  revenue_value numeric(14,2);
  costed_qty_value integer;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_daily_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

  if not public.user_has_feature_permission('date_sheet', 'import', v_org_id) then
    raise exception 'Missing permission to import Flat Data.' using errcode = '42501';
  end if;

  if actor_role = 'driver' and current_report.prepared_by <> actor_id then
    raise exception 'Drivers can only import Flat Data into their own reports.' using errcode = '42501';
  end if;

  if current_report.status <> 'draft' then
    raise exception 'Flat Data can only be imported while the report is in draft status.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(input_invoice_entries, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input_inventory_sales, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input_return_damage_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'Flat Data import payload sections must be arrays.' using errcode = '22023';
  end if;

  select
    (select count(*) from public.report_invoice_entries where daily_report_id = target_daily_report_id)
    + (select count(*) from public.report_return_damage_entries where daily_report_id = target_daily_report_id)
    + (select count(*) from public.report_inventory_entries where daily_report_id = target_daily_report_id and (sales_qty > 0 or sales_revenue_snapshot > 0))
  into existing_data_count;

  if existing_data_count > 0 and not allow_overwrite then
    raise exception 'Existing DATE data found. Confirm overwrite before importing Flat Data.' using errcode = 'P0001';
  end if;

  for item in select value from jsonb_array_elements(coalesce(input_inventory_sales, '[]'::jsonb))
  loop
    product_uuid := (item ->> 'productId')::uuid;

    if not exists (
      select 1
      from public.products p
      where p.id = product_uuid
        and p.organization_id = v_org_id
        and p.is_active = true
    ) then
      raise exception 'Imported product % does not belong to this organization or is inactive.', product_uuid using errcode = '23503';
    end if;

    select *
    into existing_entry
    from public.report_inventory_entries rie
    where rie.daily_report_id = target_daily_report_id
      and rie.product_id = product_uuid
    for update;

    if not found then
      raise exception 'Flat Data includes product % that is not in the loading sheet. Add it to loading before importing.', product_uuid using errcode = '23514';
    end if;

    sales_qty_value := coalesce((item ->> 'salesQty')::integer, 0);
    costed_qty_value := coalesce((item ->> 'costedSalesQty')::integer, sales_qty_value);
    revenue_value := coalesce((item ->> 'salesRevenue')::numeric, 0);

    if sales_qty_value < 0 or costed_qty_value < 0 or revenue_value < 0 then
      raise exception 'Flat Data sales quantities and revenue must be non-negative.' using errcode = '23514';
    end if;

    if costed_qty_value > sales_qty_value then
      raise exception 'Costed sales quantity cannot exceed sales quantity for imported products.' using errcode = '23514';
    end if;

    if sales_qty_value > existing_entry.loading_qty then
      raise exception 'Flat Data sales quantity exceeds loading quantity for %. Loaded %, sold % selling units.',
        coalesce(existing_entry.product_display_name_snapshot, existing_entry.product_name_snapshot, existing_entry.product_code_snapshot),
        existing_entry.loading_qty,
        sales_qty_value
        using errcode = '23514';
    end if;
  end loop;

  delete from public.report_invoice_entries
  where daily_report_id = target_daily_report_id;

  delete from public.report_return_damage_entries
  where daily_report_id = target_daily_report_id;

  update public.report_inventory_entries
  set
    sales_qty = 0,
    sales_revenue_snapshot = 0,
    costed_sales_qty_snapshot = 0
  where daily_report_id = target_daily_report_id;

  line_no_counter := 1;
  for item in select value from jsonb_array_elements(coalesce(input_invoice_entries, '[]'::jsonb))
  loop
    if coalesce((item ->> 'cashAmount')::numeric, 0)
       + coalesce((item ->> 'chequeAmount')::numeric, 0)
       + coalesce((item ->> 'creditAmount')::numeric, 0) <= 0 then
      continue;
    end if;

    insert into public.report_invoice_entries (
      daily_report_id, line_no, invoice_no, cash_amount, cheque_amount, credit_amount, notes
    ) values (
      target_daily_report_id,
      line_no_counter,
      coalesce(nullif(item ->> 'invoiceNo', ''), 'FLAT-' || line_no_counter::text),
      coalesce((item ->> 'cashAmount')::numeric, 0),
      coalesce((item ->> 'chequeAmount')::numeric, 0),
      coalesce((item ->> 'creditAmount')::numeric, 0),
      nullif(item ->> 'notes', '')
    );

    line_no_counter := line_no_counter + 1;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(input_inventory_sales, '[]'::jsonb))
  loop
    product_uuid := (item ->> 'productId')::uuid;
    sales_qty_value := coalesce((item ->> 'salesQty')::integer, 0);
    revenue_value := coalesce((item ->> 'salesRevenue')::numeric, 0);
    costed_qty_value := coalesce((item ->> 'costedSalesQty')::integer, sales_qty_value);

    update public.report_inventory_entries
    set
      sales_qty = sales_qty_value,
      sales_revenue_snapshot = revenue_value,
      costed_sales_qty_snapshot = costed_qty_value
    where daily_report_id = target_daily_report_id
      and product_id = product_uuid;
  end loop;

  line_no_counter := 1;
  for item in select value from jsonb_array_elements(coalesce(input_return_damage_entries, '[]'::jsonb))
  loop
    product_uuid := (item ->> 'productId')::uuid;

    if not exists (
      select 1
      from public.products p
      where p.id = product_uuid
        and p.organization_id = v_org_id
        and p.is_active = true
    ) then
      raise exception 'Return product % does not belong to this organization or is inactive.', product_uuid using errcode = '23503';
    end if;

    if coalesce((item ->> 'damageQty')::integer, 0)
       + coalesce((item ->> 'returnQty')::integer, 0)
       + coalesce((item ->> 'freeIssueQty')::integer, 0) <= 0 then
      continue;
    end if;

    insert into public.report_return_damage_entries (
      daily_report_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      unit_price_snapshot,
      invoice_no,
      shop_name,
      damage_qty,
      return_qty,
      free_issue_qty,
      notes
    )
    select
      target_daily_report_id,
      p.id,
      p.product_code,
      p.product_name,
      p.unit_price,
      nullif(item ->> 'invoiceNo', ''),
      nullif(item ->> 'shopName', ''),
      coalesce((item ->> 'damageQty')::integer, 0),
      coalesce((item ->> 'returnQty')::integer, 0),
      coalesce((item ->> 'freeIssueQty')::integer, 0),
      nullif(item ->> 'notes', '')
    from public.products p
    where p.id = product_uuid;

    line_no_counter := line_no_counter + 1;
  end loop;

  if input_delivered_bill_count is not null and input_delivered_bill_count > 0 then
    update public.daily_reports
    set
      delivered_bill_count = input_delivered_bill_count,
      total_bill_count = greatest(total_bill_count, input_delivered_bill_count + cancelled_bill_count)
    where id = target_daily_report_id;
  end if;

  perform public.recalculate_daily_report_totals(target_daily_report_id);

  select *
  into current_report
  from public.daily_reports
  where id = target_daily_report_id;

  return current_report;
end;
$$;

grant execute on function public.user_has_feature_permission(text, text, uuid) to authenticated;
grant execute on function public.import_flat_data_report(uuid, jsonb, jsonb, jsonb, integer, boolean) to authenticated;
grant execute on function public.sync_driver_deductions_for_report(uuid) to authenticated;
grant execute on function public.resolve_driver_deduction(uuid, text, text) to authenticated;
grant execute on function public.receive_main_inventory(uuid, uuid, integer, text) to authenticated;
grant execute on function public.finalize_loading_summary(uuid, text) to authenticated;
grant execute on function public.submit_daily_report(uuid) to authenticated;
grant execute on function public.approve_daily_report(uuid) to authenticated;
grant execute on function public.reopen_daily_report(uuid) to authenticated;

create index if not exists daily_reports_route_date_status_idx on public.daily_reports (route_program_id, report_date, status) where deleted_at is null;
create index if not exists daily_reports_status_updated_idx on public.daily_reports (status, updated_at desc) where deleted_at is null;
create index if not exists report_inventory_entries_report_product_idx on public.report_inventory_entries (daily_report_id, product_id);
create index if not exists main_inventory_org_product_idx on public.main_inventory (organization_id, product_id);
create index if not exists user_feature_overrides_org_user_idx on public.user_feature_overrides (organization_id, user_id);
create index if not exists driver_deductions_report_status_idx on public.driver_deductions (daily_report_id, status);
create index if not exists driver_deductions_org_driver_idx on public.driver_deductions (organization_id, driver_id);

comment on table public.feature_permissions is 'Default feature/action permissions by application role.';
comment on table public.user_feature_overrides is 'Organization-scoped per-user permission allow/deny overrides.';
comment on table public.driver_deductions is 'Driver salary deduction candidates generated from negative lorry stock variance.';
comment on function public.import_flat_data_report(uuid, jsonb, jsonb, jsonb, integer, boolean) is
  'Transactional Flat Data import: preserves loading quantities, overwrites DATE sales/invoices/returns only after confirmation, and rolls back on any validation failure.';
comment on function public.sync_driver_deductions_for_report(uuid) is
  'Creates or refreshes driver deduction candidates from negative product variance on a route-day handover.';
comment on function public.resolve_driver_deduction(uuid, text, text) is
  'Approves, waives, or settles a driver deduction candidate.';

commit;



-- ============================================================================
-- supabase/migrations/0037_fix_daily_report_rls.sql
-- ============================================================================

begin;

-- Create security definer function for the insert policy
create or replace function public.can_insert_daily_report(target_route_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_programs rp
    where rp.id = target_route_program_id
      and (
        public.user_has_feature_permission('loading_summaries', 'create', rp.organization_id)
        or public.user_has_feature_permission('daily_reports', 'create', rp.organization_id)
      )
      and public.user_has_org_access(rp.organization_id)
  );
$$;

drop policy if exists daily_reports_insert_policy on public.daily_reports;

create policy daily_reports_insert_policy
on public.daily_reports
for insert
to authenticated
with check (
  public.can_insert_daily_report(route_program_id)
  and prepared_by = auth.uid()
);

commit;



-- ============================================================================
-- supabase/migrations/0038_product_pricing_fields.sql
-- ============================================================================

begin;

alter table public.products
  add column if not exists wholesale_price numeric(12, 2),
  add column if not exists piece_margin numeric(12, 2);

-- Map the SKU from the product prices.pdf to populate prices
update public.products
set 
  distributor_price = case 
    when sku = '016' then 60.56
    when sku = '017' then 107.03
    when sku = '018' then 206.11
    when sku = '019' then 412.22
    when sku = '002' then 81.39
    when sku = '039' then 163.61
    when sku = '037' then 131.67
    when sku = '008' then 309.44
    when sku = '043' then 105.00
    when sku = '048' then 51.11
    when sku = '044' then 105.00
    when sku = '049' then 51.11
    when sku = '042' then 240.28
    when sku = '028' then 72.22
    when sku = '056' then 72.22
    when sku = '034' then 145.28
    when sku = '057' then 145.28
    when sku = '029' then 72.22
    when sku = '021' then 211.11
    when sku = '022' then 425.00
    when sku = '023' then 39.72
    when sku = '024' then 77.78
    when sku = '025' then 211.11
    when sku = '026' then 425.00
    when sku = '045' then 133.33
    when sku = '046' then 266.67
    when sku = '020' then 28.06
    when sku = '001' then 45.83
    when sku = '035' then 81.67
    when sku = '009' then 45.83
    when sku = '031' then 79.44
    when sku = '010' then 45.83
    when sku = '032' then 79.44
    when sku = '041' then 165.00
    when sku = '053' then 55.56
    when sku = '052' then 55.56
    when sku = '055' then 55.56
    when sku = '036' then 47.22
    when sku = '011' then 160.00
    when sku = '012' then 170.00
    when sku = '013' then 165.00
    when sku = '014' then 175.00
    when sku = '015' then 165.00
    else distributor_price
  end,
  wholesale_price = case 
    when sku = '016' then 65.46
    when sku = '017' then 115.70
    when sku = '018' then 222.82
    when sku = '019' then 445.64
    when sku = '002' then 87.99
    when sku = '039' then 176.88
    when sku = '037' then 142.34
    when sku = '008' then 334.54
    when sku = '043' then 113.51
    when sku = '048' then 55.26
    when sku = '044' then 113.51
    when sku = '049' then 55.26
    when sku = '042' then 259.76
    when sku = '028' then 78.08
    when sku = '056' then 78.08
    when sku = '034' then 157.06
    when sku = '057' then 157.06
    when sku = '029' then 78.08
    when sku = '021' then 228.23
    when sku = '022' then 459.46
    when sku = '023' then 42.94
    when sku = '024' then 84.08
    when sku = '025' then 228.23
    when sku = '026' then 459.46
    when sku = '045' then 144.14
    when sku = '046' then 288.29
    when sku = '020' then 30.33
    when sku = '001' then 49.55
    when sku = '035' then 88.29
    when sku = '009' then 49.55
    when sku = '031' then 85.89
    when sku = '010' then 49.55
    when sku = '032' then 85.89
    when sku = '041' then 178.38
    when sku = '053' then 60.06
    when sku = '052' then 60.06
    when sku = '055' then 60.06
    when sku = '036' then 51.05
    when sku = '011' then 172.97
    when sku = '012' then 183.78
    when sku = '013' then 178.38
    when sku = '014' then 189.19
    when sku = '015' then 178.38
    else wholesale_price
  end,
  piece_margin = case 
    when sku = '016' then 4.90
    when sku = '017' then 8.67
    when sku = '018' then 16.71
    when sku = '019' then 33.42
    when sku = '002' then 6.60
    when sku = '039' then 13.27
    when sku = '037' then 10.67
    when sku = '008' then 25.10
    when sku = '043' then 8.51
    when sku = '048' then 4.15
    when sku = '044' then 8.51
    when sku = '049' then 4.15
    when sku = '042' then 19.48
    when sku = '028' then 5.86
    when sku = '056' then 5.86
    when sku = '034' then 11.78
    when sku = '057' then 11.78
    when sku = '029' then 5.86
    when sku = '021' then 17.12
    when sku = '022' then 34.46
    when sku = '023' then 3.22
    when sku = '024' then 6.30
    when sku = '025' then 17.12
    when sku = '026' then 34.46
    when sku = '045' then 10.81
    when sku = '046' then 21.62
    when sku = '020' then 2.27
    when sku = '001' then 3.72
    when sku = '035' then 6.62
    when sku = '009' then 3.72
    when sku = '031' then 6.45
    when sku = '010' then 3.72
    when sku = '032' then 6.45
    when sku = '041' then 13.38
    when sku = '053' then 4.50
    when sku = '052' then 4.50
    when sku = '055' then 4.50
    when sku = '036' then 3.83
    when sku = '011' then 12.97
    when sku = '012' then 13.78
    when sku = '013' then 13.38
    when sku = '014' then 14.19
    when sku = '015' then 13.38
    else piece_margin
  end
where is_active = true;

commit;



-- ============================================================================
-- supabase/migrations/0039_allow_loading_summary_daily_report_insert.sql
-- ============================================================================

begin;

-- Loading summaries are stored in daily_reports. The service correctly checks
-- loading_summaries.create before insert, so the RLS insert policy must allow
-- that feature permission as well as the broader daily_reports.create grant.
create or replace function public.can_insert_daily_report(target_route_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_programs rp
    where rp.id = target_route_program_id
      and public.user_has_org_access(rp.organization_id)
      and (
        public.user_has_feature_permission('loading_summaries', 'create', rp.organization_id)
        or public.user_has_feature_permission('daily_reports', 'create', rp.organization_id)
      )
  );
$$;

drop policy if exists daily_reports_insert_policy on public.daily_reports;

create policy daily_reports_insert_policy
on public.daily_reports
for insert
to authenticated
with check (
  public.can_insert_daily_report(route_program_id)
  and prepared_by = auth.uid()
);

commit;



-- ============================================================================
-- supabase/migrations/0040_create_loading_summary_rpc.sql
-- ============================================================================

begin;

-- Loading summaries are route-day daily_reports. Creating them through a
-- security-definer RPC avoids brittle double-authorization where the API has
-- already checked loading_summaries.create but a generic daily_reports insert
-- RLS policy can still reject the row.
create or replace function public.create_loading_summary(
  p_report_date date,
  p_route_program_id uuid,
  p_staff_name text,
  p_remarks text default null,
  p_loading_notes text default null
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  route_row public.route_programs%rowtype;
  existing_report public.daily_reports%rowtype;
  created_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'Only admin, supervisor, or driver can create loading summaries.' using errcode = '42501';
  end if;

  select *
  into route_row
  from public.route_programs
  where id = p_route_program_id
    and is_active = true;

  if not found then
    raise exception 'Route program not found or inactive.' using errcode = 'P0002';
  end if;

  if not public.user_has_org_access(route_row.organization_id) then
    raise exception 'Route program does not belong to an organization you can access.' using errcode = '42501';
  end if;

  if not public.user_has_feature_permission('loading_summaries', 'create', route_row.organization_id) then
    raise exception 'Missing permission to create loading summaries.' using errcode = '42501';
  end if;

  select *
  into existing_report
  from public.daily_reports
  where report_date = p_report_date
    and route_program_id = p_route_program_id
    and deleted_at is null
  limit 1;

  if found then
    return existing_report;
  end if;

  insert into public.daily_reports (
    report_date,
    route_program_id,
    prepared_by,
    staff_name,
    territory_name_snapshot,
    route_name_snapshot,
    remarks,
    loading_notes,
    status
  )
  values (
    p_report_date,
    p_route_program_id,
    actor_id,
    trim(p_staff_name),
    route_row.territory_name,
    route_row.route_name,
    nullif(trim(coalesce(p_remarks, '')), ''),
    nullif(trim(coalesce(p_loading_notes, '')), ''),
    'draft'
  )
  returning * into created_report;

  return created_report;
end;
$$;

grant execute on function public.create_loading_summary(date, uuid, text, text, text) to authenticated;

commit;



-- ============================================================================
-- supabase/migrations/0041_save_loading_summary_items_rpc.sql
-- ============================================================================

begin;

-- Dedicated route-day stock movement save function.
-- This keeps morning loading edits independent from the broader DATE inventory
-- save RPC, while still using the authenticated user context and existing
-- inventory mutation guards.

create or replace function public.save_loading_summary_items(
  target_daily_report_id uuid,
  input_entries jsonb
)
returns setof public.report_inventory_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  report_row public.daily_reports%rowtype;
  org_id uuid;
  entry jsonb;
  entry_id uuid;
  entry_product_id uuid;
  entry_loading_qty integer;
  entry_sales_qty integer;
  entry_lorry_qty integer;
  existing_count integer;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'Only admin, supervisor, or driver can edit loading items.' using errcode = '42501';
  end if;

  select *
  into report_row
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  select rp.organization_id
  into org_id
  from public.route_programs rp
  where rp.id = report_row.route_program_id;

  if org_id is null then
    raise exception 'Route organization was not found for this loading summary.' using errcode = 'P0002';
  end if;

  if actor_role = 'driver' and report_row.prepared_by <> actor_id then
    raise exception 'Drivers can only edit loading items on their own summaries.' using errcode = '42501';
  end if;

  if report_row.status <> 'draft' then
    raise exception 'Loading items can only be edited while the route-day sheet is in draft status.' using errcode = 'P0001';
  end if;

  if input_entries is null then
    input_entries := '[]'::jsonb;
  end if;

  if jsonb_typeof(input_entries) <> 'array' then
    raise exception 'Loading item payload must be a JSON array.' using errcode = '22023';
  end if;

  for entry in select value from jsonb_array_elements(input_entries)
  loop
    entry_id := null;
    if coalesce(entry ->> 'id', '') <> '' then
      entry_id := (entry ->> 'id')::uuid;
    end if;

    entry_product_id := (entry ->> 'productId')::uuid;
    entry_loading_qty := coalesce((entry ->> 'loadingQty')::integer, 0);
    entry_sales_qty := coalesce((entry ->> 'salesQty')::integer, 0);
    entry_lorry_qty := coalesce((entry ->> 'lorryQty')::integer, 0);

    if entry_product_id is null then
      raise exception 'Each loading item must include a product.' using errcode = '23514';
    end if;

    if entry_loading_qty < 0 or entry_sales_qty < 0 or entry_lorry_qty < 0 then
      raise exception 'Loading, sales, and lorry quantities must be non-negative selling units.' using errcode = '23514';
    end if;

    if entry_sales_qty > entry_loading_qty then
      raise exception 'Sales quantity cannot exceed loading quantity.' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.products p
      where p.id = entry_product_id
        and p.organization_id = org_id
        and p.is_active = true
    ) then
      raise exception 'Selected product does not belong to this organization or is inactive.' using errcode = '23503';
    end if;

    if report_row.loading_completed_at is null then
      if entry_sales_qty > 0 or entry_lorry_qty > 0 then
        raise exception 'Sales and lorry quantities can only be recorded after morning loading is finalized.' using errcode = 'P0001';
      end if;
    else
      if entry_id is null then
        raise exception 'Morning loading rows are locked after finalize. Save against existing rows only.' using errcode = 'P0001';
      end if;

      if not exists (
        select 1
        from public.report_inventory_entries rie
        where rie.id = entry_id
          and rie.daily_report_id = target_daily_report_id
          and rie.product_id = entry_product_id
          and rie.loading_qty = entry_loading_qty
      ) then
        raise exception 'Product selection and loading quantity are locked after morning finalize.' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  if report_row.loading_completed_at is null then
    delete from public.report_inventory_entries
    where daily_report_id = target_daily_report_id;

    for entry in select value from jsonb_array_elements(input_entries)
    loop
      insert into public.report_inventory_entries (
        id,
        daily_report_id,
        product_id,
        product_code_snapshot,
        product_name_snapshot,
        product_display_name_snapshot,
        brand_snapshot,
        product_family_snapshot,
        variant_snapshot,
        unit_size_snapshot,
        unit_measure_snapshot,
        pack_size_snapshot,
        selling_unit_snapshot,
        quantity_entry_mode_snapshot,
        unit_price_snapshot,
        distributor_price_snapshot,
        loading_qty,
        sales_qty,
        lorry_qty,
        sales_revenue_snapshot,
        costed_sales_qty_snapshot
      )
      select
        coalesce(nullif(entry ->> 'id', '')::uuid, gen_random_uuid()),
        target_daily_report_id,
        p.id,
        p.product_code,
        p.product_name,
        coalesce(p.display_name, p.product_name),
        p.brand,
        p.product_family,
        p.variant,
        p.unit_size,
        p.unit_measure,
        p.pack_size,
        p.selling_unit,
        p.quantity_entry_mode,
        p.unit_price,
        coalesce(p.distributor_price, 0),
        coalesce((entry ->> 'loadingQty')::integer, 0),
        0,
        0,
        0,
        0
      from public.products p
      where p.id = (entry ->> 'productId')::uuid;
    end loop;
  else
    select count(*)
    into existing_count
    from public.report_inventory_entries
    where daily_report_id = target_daily_report_id;

    if existing_count <> jsonb_array_length(input_entries) then
      raise exception 'Morning loading rows are locked after finalize. Do not add or remove rows during reconciliation.' using errcode = 'P0001';
    end if;

    for entry in select value from jsonb_array_elements(input_entries)
    loop
      update public.report_inventory_entries
      set
        sales_qty = coalesce((entry ->> 'salesQty')::integer, 0),
        lorry_qty = coalesce((entry ->> 'lorryQty')::integer, 0),
        sales_revenue_snapshot = round(coalesce((entry ->> 'salesQty')::integer, 0) * unit_price_snapshot, 2),
        costed_sales_qty_snapshot = coalesce((entry ->> 'salesQty')::integer, 0),
        updated_at = timezone('utc', now())
      where id = (entry ->> 'id')::uuid
        and daily_report_id = target_daily_report_id;
    end loop;
  end if;

  perform public.recalculate_daily_report_totals(target_daily_report_id);

  return query
  select *
  from public.report_inventory_entries
  where daily_report_id = target_daily_report_id
  order by coalesce(product_display_name_snapshot, product_name_snapshot) asc, created_at asc;
end;
$$;

grant execute on function public.save_loading_summary_items(uuid, jsonb) to authenticated;

comment on function public.save_loading_summary_items(uuid, jsonb) is
  'Saves route-day stock movement rows using selling-unit quantities. Morning stage can change products/loading; after finalize only sales and lorry counts can change.';

commit;



-- ============================================================================
-- supabase/migrations/0042_complete_finance_workflow.sql
-- ============================================================================

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



-- ============================================================================
-- supabase/migrations/0043_customer_credit_history.sql
-- ============================================================================

begin;

-- Customer finance history layer.
-- Builds on 0042 by connecting route-day finance rows to customer credit
-- accounts, aging, customer matching, collections, and immutable events.

alter table public.organizations
  add column if not exists default_credit_days integer not null default 7
  check (default_credit_days >= 0 and default_credit_days <= 365);

alter table public.customers
  add column if not exists credit_days integer not null default 7
  check (credit_days >= 0 and credit_days <= 365),
  add column if not exists credit_limit numeric(14,2) not null default 0
  check (credit_limit >= 0),
  add column if not exists credit_status text not null default 'active'
  check (credit_status in ('active', 'hold', 'blocked'));

alter table public.customer_credit_accounts
  add column if not exists default_credit_days integer not null default 7
  check (default_credit_days >= 0 and default_credit_days <= 365),
  add column if not exists credit_status text not null default 'active'
  check (credit_status in ('active', 'hold', 'blocked'));

create table if not exists public.unmatched_customer_outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'flat_data',
  source_outlet_id text,
  outlet_name text not null,
  normalized_outlet_name text generated always as (lower(trim(outlet_name))) stored,
  route_name text,
  first_seen_report_id uuid references public.daily_reports(id) on delete set null,
  last_seen_report_id uuid references public.daily_reports(id) on delete set null,
  suggested_customer_id uuid references public.customers(id) on delete set null,
  resolved_customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'created', 'ignored')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, normalized_outlet_name)
);

create table if not exists public.finance_ledger_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  daily_report_id uuid references public.daily_reports(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_credit_account_id uuid references public.customer_credit_accounts(id) on delete set null,
  amount numeric(14,2),
  status_from text,
  status_to text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_unmatched_customer_outlets_updated_at on public.unmatched_customer_outlets;
create trigger set_unmatched_customer_outlets_updated_at
before update on public.unmatched_customer_outlets
for each row execute procedure public.set_updated_at();

alter table public.unmatched_customer_outlets enable row level security;
alter table public.finance_ledger_events enable row level security;

drop policy if exists unmatched_customer_outlets_select_policy on public.unmatched_customer_outlets;
create policy unmatched_customer_outlets_select_policy
on public.unmatched_customer_outlets
for select to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'view', organization_id)
);

drop policy if exists unmatched_customer_outlets_write_policy on public.unmatched_customer_outlets;
create policy unmatched_customer_outlets_write_policy
on public.unmatched_customer_outlets
for all to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
);

drop policy if exists finance_ledger_events_select_policy on public.finance_ledger_events;
create policy finance_ledger_events_select_policy
on public.finance_ledger_events
for select to authenticated
using (
  public.user_has_org_access(organization_id)
  and (
    public.user_has_feature_permission('customers', 'view', organization_id)
    or public.user_has_feature_permission('date_sheet', 'view', organization_id)
  )
);

create or replace function public.normalize_customer_name(input text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(input, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.credit_aging_bucket(target_due_date date, target_status text, target_outstanding numeric)
returns text
language sql
stable
as $$
  select case
    when coalesce(target_outstanding, 0) <= 0 or target_status in ('settled', 'written_off') then 'settled'
    when target_due_date is null then 'unassigned'
    when target_due_date > current_date then 'current'
    when target_due_date = current_date then 'due_today'
    when current_date - target_due_date between 1 and 7 then '1_7'
    when current_date - target_due_date between 8 and 14 then '8_14'
    when current_date - target_due_date between 15 and 30 then '15_30'
    when current_date - target_due_date between 31 and 60 then '31_60'
    when current_date - target_due_date between 61 and 90 then '61_90'
    else '90_plus'
  end;
$$;

create or replace function public.log_finance_event(
  target_organization_id uuid,
  target_event_type text,
  target_entity_type text,
  target_entity_id uuid,
  target_daily_report_id uuid default null,
  target_customer_id uuid default null,
  target_customer_credit_account_id uuid default null,
  target_amount numeric default null,
  target_status_from text default null,
  target_status_to text default null,
  target_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_ledger_events (
    organization_id,
    event_type,
    entity_type,
    entity_id,
    daily_report_id,
    customer_id,
    customer_credit_account_id,
    amount,
    status_from,
    status_to,
    details,
    created_by
  ) values (
    target_organization_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    target_daily_report_id,
    target_customer_id,
    target_customer_credit_account_id,
    target_amount,
    target_status_from,
    target_status_to,
    coalesce(target_details, '{}'::jsonb),
    auth.uid()
  );
end;
$$;

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
  v_customer_id uuid;
  v_customer_name text;
  v_credit_days integer;
begin
  select public.finance_report_organization_id(target_daily_report_id) into v_org_id;

  if v_org_id is null then
    raise exception 'Report organization was not found.' using errcode = 'P0002';
  end if;

  insert into public.report_bills (
    daily_report_id,
    invoice_entry_id,
    invoice_no,
    customer_name,
    amount_snapshot,
    status
  )
  select
    rie.daily_report_id,
    rie.id,
    rie.invoice_no,
    nullif(trim(rie.notes), ''),
    round(coalesce(rie.cash_amount, 0) + coalesce(rie.cheque_amount, 0) + coalesce(rie.credit_amount, 0), 2),
    'delivered'
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_daily_report_id
  on conflict (daily_report_id, invoice_no)
  do update set
    invoice_entry_id = excluded.invoice_entry_id,
    customer_name = coalesce(excluded.customer_name, public.report_bills.customer_name),
    amount_snapshot = excluded.amount_snapshot,
    updated_at = timezone('utc', now());

  for item in
    select *
    from public.report_invoice_entries rie
    where rie.daily_report_id = target_daily_report_id
      and rie.credit_amount > 0
  loop
    v_customer_name := coalesce(nullif(trim(item.notes), ''), 'Unknown Credit Customer');
    v_customer_id := null;
    v_credit_days := null;

    -- First honor any reviewed Flat Data outlet match. This lets admins link
    -- "shop/outlet" names from the mother-company file to the clean customer
    -- master once, then all future imports follow that decision.
    select c.id, c.name, c.credit_days
    into v_customer_id, v_customer_name, v_credit_days
    from public.unmatched_customer_outlets uco
    join public.customers c
      on c.id = uco.resolved_customer_id
     and c.organization_id = uco.organization_id
    where uco.organization_id = v_org_id
      and uco.status in ('linked', 'created')
      and public.normalize_customer_name(uco.outlet_name) = public.normalize_customer_name(v_customer_name)
    order by uco.resolved_at desc nulls last, uco.updated_at desc
    limit 1;

    if v_customer_id is null then
      select c.id, c.name, c.credit_days
      into v_customer_id, v_customer_name, v_credit_days
      from public.customers c
      where c.organization_id = v_org_id
        and public.normalize_customer_name(c.name) = public.normalize_customer_name(v_customer_name)
      order by c.updated_at desc
      limit 1;
    end if;

    if v_customer_id is null then
      insert into public.unmatched_customer_outlets (
        organization_id,
        outlet_name,
        first_seen_report_id,
        last_seen_report_id,
        status
      ) values (
        v_org_id,
        v_customer_name,
        target_daily_report_id,
        target_daily_report_id,
        'pending'
      )
      on conflict (organization_id, normalized_outlet_name)
      do update set
        last_seen_report_id = excluded.last_seen_report_id,
        updated_at = timezone('utc', now());
    end if;

    insert into public.customer_credit_accounts (
      organization_id,
      customer_id,
      customer_name,
      default_credit_days,
      credit_limit,
      credit_status
    ) values (
      v_org_id,
      v_customer_id,
      v_customer_name,
      coalesce(v_credit_days, (select default_credit_days from public.organizations where id = v_org_id), 7),
      coalesce((select credit_limit from public.customers where id = v_customer_id), 0),
      coalesce((select credit_status from public.customers where id = v_customer_id), 'active')
    )
    on conflict (organization_id, normalized_customer_name)
    do update set
      customer_id = coalesce(excluded.customer_id, public.customer_credit_accounts.customer_id),
      default_credit_days = excluded.default_credit_days,
      credit_limit = excluded.credit_limit,
      credit_status = excluded.credit_status,
      updated_at = timezone('utc', now())
    returning id into v_account_id;

    insert into public.credit_invoices (
      organization_id,
      daily_report_id,
      invoice_entry_id,
      credit_account_id,
      invoice_no,
      customer_name,
      invoice_date,
      due_date,
      amount,
      collected_amount,
      status
    ) values (
      v_org_id,
      target_daily_report_id,
      item.id,
      v_account_id,
      item.invoice_no,
      v_customer_name,
      current_date,
      current_date + coalesce(v_credit_days, (select default_credit_days from public.organizations where id = v_org_id), 7),
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
      due_date = coalesce(public.credit_invoices.due_date, excluded.due_date),
      status = case
        when public.credit_invoices.collected_amount >= excluded.amount then 'settled'
        when public.credit_invoices.collected_amount > 0 then 'partially_paid'
        else 'open'
      end,
      updated_at = timezone('utc', now());
  end loop;
end;
$$;

create or replace function public.post_credit_collection(
  target_credit_invoice_id uuid,
  collection_amount numeric,
  collection_method text,
  collection_reference text default null,
  collection_notes text default null,
  collection_date date default current_date
)
returns public.credit_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.credit_invoices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id
  for update;

  if not found then
    raise exception 'Credit invoice not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'edit', invoice_row.organization_id) then
    raise exception 'Missing permission to post credit collections.' using errcode = '42501';
  end if;

  if collection_amount <= 0 or collection_amount > invoice_row.outstanding_amount then
    raise exception 'Collection amount must be positive and cannot exceed outstanding balance.' using errcode = '23514';
  end if;

  if collection_method not in ('cash', 'cheque', 'bank', 'other') then
    raise exception 'Invalid credit collection payment method.' using errcode = '23514';
  end if;

  insert into public.credit_collections (
    organization_id,
    credit_invoice_id,
    collected_at,
    amount,
    payment_method,
    reference_no,
    notes,
    created_by
  ) values (
    invoice_row.organization_id,
    invoice_row.id,
    coalesce(collection_date, current_date),
    collection_amount,
    collection_method,
    nullif(trim(collection_reference), ''),
    nullif(trim(collection_notes), ''),
    auth.uid()
  );

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id;

  perform public.log_finance_event(
    invoice_row.organization_id,
    'credit_collection_posted',
    'credit_invoice',
    invoice_row.id,
    invoice_row.daily_report_id,
    null,
    invoice_row.credit_account_id,
    collection_amount,
    null,
    invoice_row.status,
    jsonb_build_object('method', collection_method, 'reference', collection_reference)
  );

  return invoice_row;
end;
$$;

create or replace function public.update_credit_invoice_status(
  target_credit_invoice_id uuid,
  target_status text,
  status_notes text default null
)
returns public.credit_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.credit_invoices%rowtype;
  previous_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id
  for update;

  if not found then
    raise exception 'Credit invoice not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'approve', invoice_row.organization_id) then
    raise exception 'Missing permission to update credit invoice status.' using errcode = '42501';
  end if;

  if target_status not in ('open', 'partially_paid', 'settled', 'written_off', 'disputed') then
    raise exception 'Invalid credit invoice status.' using errcode = '23514';
  end if;

  if target_status = 'settled' and invoice_row.outstanding_amount > 0 then
    raise exception 'Credit invoice can only be manually settled when outstanding balance is zero.' using errcode = '23514';
  end if;

  previous_status := invoice_row.status;

  update public.credit_invoices
  set
    status = target_status,
    notes = coalesce(nullif(trim(status_notes), ''), notes),
    updated_at = timezone('utc', now())
  where id = target_credit_invoice_id
  returning * into invoice_row;

  perform public.log_finance_event(
    invoice_row.organization_id,
    'credit_status_changed',
    'credit_invoice',
    invoice_row.id,
    invoice_row.daily_report_id,
    null,
    invoice_row.credit_account_id,
    null,
    previous_status,
    target_status,
    jsonb_build_object('notes', status_notes)
  );

  return invoice_row;
end;
$$;

create or replace function public.update_report_cheque_status(
  target_cheque_id uuid,
  target_status text,
  status_notes text default null
)
returns public.report_cheques
language plpgsql
security definer
set search_path = public
as $$
declare
  cheque_row public.report_cheques%rowtype;
  previous_status text;
  org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into cheque_row
  from public.report_cheques
  where id = target_cheque_id
  for update;

  if not found then
    raise exception 'Cheque not found.' using errcode = 'P0002';
  end if;

  select public.finance_report_organization_id(cheque_row.daily_report_id) into org_id;

  if not public.user_has_feature_permission('date_sheet', 'edit', org_id) then
    raise exception 'Missing permission to update cheque status.' using errcode = '42501';
  end if;

  if target_status not in ('received', 'deposited', 'realized', 'bounced', 'returned', 'cancelled') then
    raise exception 'Invalid cheque status.' using errcode = '23514';
  end if;

  previous_status := cheque_row.status;

  update public.report_cheques
  set
    status = target_status,
    notes = coalesce(nullif(trim(status_notes), ''), notes),
    updated_at = timezone('utc', now())
  where id = target_cheque_id
  returning * into cheque_row;

  perform public.log_finance_event(
    org_id,
    'cheque_status_changed',
    'report_cheque',
    cheque_row.id,
    cheque_row.daily_report_id,
    null,
    null,
    cheque_row.amount,
    previous_status,
    target_status,
    jsonb_build_object('notes', status_notes, 'chequeNo', cheque_row.cheque_no)
  );

  return cheque_row;
end;
$$;

create or replace function public.resolve_unmatched_customer_outlet(
  target_match_id uuid,
  target_action text,
  target_customer_id uuid default null
)
returns public.unmatched_customer_outlets
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.unmatched_customer_outlets%rowtype;
  customer_row public.customers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into match_row
  from public.unmatched_customer_outlets
  where id = target_match_id
  for update;

  if not found then
    raise exception 'Unmatched customer record not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('customers', 'edit', match_row.organization_id) then
    raise exception 'Missing permission to resolve customer matches.' using errcode = '42501';
  end if;

  if target_action not in ('link', 'create', 'ignore') then
    raise exception 'Invalid customer match action.' using errcode = '23514';
  end if;

  if target_action = 'link' then
    select * into customer_row
    from public.customers
    where id = target_customer_id
      and organization_id = match_row.organization_id;

    if not found then
      raise exception 'Selected customer was not found in this organization.' using errcode = '23503';
    end if;

    update public.unmatched_customer_outlets
    set
      resolved_customer_id = customer_row.id,
      status = 'linked',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  elsif target_action = 'create' then
    insert into public.customers (
      organization_id,
      code,
      name,
      channel,
      status
    ) values (
      match_row.organization_id,
      'AUTO-' || upper(substr(replace(match_row.id::text, '-', ''), 1, 8)),
      match_row.outlet_name,
      'RETAIL',
      'ACTIVE'
    )
    returning * into customer_row;

    update public.unmatched_customer_outlets
    set
      resolved_customer_id = customer_row.id,
      status = 'created',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  else
    update public.unmatched_customer_outlets
    set
      status = 'ignored',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  end if;

  if target_action in ('link', 'create') then
    update public.customer_credit_accounts
    set
      customer_id = customer_row.id,
      customer_name = customer_row.name,
      default_credit_days = customer_row.credit_days,
      credit_limit = customer_row.credit_limit,
      credit_status = customer_row.credit_status,
      updated_at = timezone('utc', now())
    where organization_id = match_row.organization_id
      and public.normalize_customer_name(customer_name) = public.normalize_customer_name(match_row.outlet_name);

    update public.credit_invoices ci
    set
      customer_name = customer_row.name,
      updated_at = timezone('utc', now())
    from public.customer_credit_accounts cca
    where ci.credit_account_id = cca.id
      and ci.organization_id = match_row.organization_id
      and cca.customer_id = customer_row.id;
  end if;

  return match_row;
end;
$$;

create index if not exists customers_org_credit_status_idx on public.customers (organization_id, credit_status);
create index if not exists credit_invoices_org_due_status_idx on public.credit_invoices (organization_id, due_date, status);
create index if not exists credit_invoices_account_status_idx on public.credit_invoices (credit_account_id, status);
create index if not exists finance_ledger_events_org_created_idx on public.finance_ledger_events (organization_id, created_at desc);
create index if not exists unmatched_customer_outlets_org_status_idx on public.unmatched_customer_outlets (organization_id, status, updated_at desc);

grant execute on function public.post_credit_collection(uuid, numeric, text, text, text, date) to authenticated;
grant execute on function public.update_credit_invoice_status(uuid, text, text) to authenticated;
grant execute on function public.update_report_cheque_status(uuid, text, text) to authenticated;
grant execute on function public.resolve_unmatched_customer_outlet(uuid, text, uuid) to authenticated;

comment on table public.unmatched_customer_outlets is 'Review queue for Flat Data outlet/customer names that do not yet match customer master records.';
comment on table public.finance_ledger_events is 'Immutable finance event history across credit, cheques, bills, expenses, cash adjustments, collections, and payroll.';
comment on function public.credit_aging_bucket(date, text, numeric) is 'Classifies open receivables into accounts-receivable aging buckets.';

commit;



-- ============================================================================
-- supabase/migrations/0044_seed_expense_categories.sql
-- ============================================================================

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
