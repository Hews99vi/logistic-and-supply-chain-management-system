insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create or replace function public.can_access_storage_object(object_name text)
returns boolean
language sql
stable
as $$
  select split_part(object_name, '/', 1)::uuid = any(public.current_user_organization_ids());
$$;

create policy "organization_assets_read"
on storage.objects
for select
using (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

create policy "organization_assets_write"
on storage.objects
for insert
with check (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);

create policy "organization_assets_update"
on storage.objects
for update
using (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
)
with check (
  bucket_id = 'organization-assets'
  and auth.role() = 'authenticated'
  and public.can_access_storage_object(name)
);