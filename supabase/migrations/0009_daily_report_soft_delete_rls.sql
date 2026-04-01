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
