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
