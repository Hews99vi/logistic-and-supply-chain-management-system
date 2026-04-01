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
