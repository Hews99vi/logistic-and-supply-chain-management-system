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
