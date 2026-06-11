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
