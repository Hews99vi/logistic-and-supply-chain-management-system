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
