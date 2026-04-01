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
