begin;

-- Fix recursive RLS evaluation on public.profiles.
-- Previous policy expressions called helper functions that read public.profiles,
-- which could recurse during policy checks and cause "stack depth limit exceeded".

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);

drop policy if exists profiles_insert_policy on public.profiles;
create policy profiles_insert_policy
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
);

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);

drop policy if exists profiles_delete_policy on public.profiles;
create policy profiles_delete_policy
on public.profiles
for delete
to authenticated
using (
  false
);

commit;
