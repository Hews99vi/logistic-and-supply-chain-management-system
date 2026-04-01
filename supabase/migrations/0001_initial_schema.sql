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
