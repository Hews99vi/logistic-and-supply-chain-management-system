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
