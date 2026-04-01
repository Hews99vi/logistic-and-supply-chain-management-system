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
