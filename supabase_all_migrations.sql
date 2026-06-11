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

create policy "organizations_select_by_membership"
on public.organizations
for select
using (id = any(public.current_user_organization_ids()));

create policy "profiles_select_own_record"
on public.profiles
for select
using (id = auth.uid());

create policy "profiles_update_own_record"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "memberships_select_own_orgs"
on public.organization_memberships
for select
using (organization_id = any(public.current_user_organization_ids()));

create policy "depots_access_by_membership"
on public.depots
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));

create policy "products_access_by_membership"
on public.products
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));

create policy "customers_access_by_membership"
on public.customers
for all
using (organization_id = any(public.current_user_organization_ids()))
with check (organization_id = any(public.current_user_organization_ids()));
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

create policy "organization_assets_read"
on storage.objects
for select
using (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

create policy "organization_assets_write"
on storage.objects
for insert
with check (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

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
);-- Dairy route operation tracking schema
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

commit;begin;

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

commit;begin;

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

commit;begin;

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

commit;begin;

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

commit;begin;

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

commit;begin;

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

commit;begin;

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
    '^(.*?)(?:\s+)?(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\s*[xX×]\s*(\d+)\s*$',
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
