begin;

alter table public.route_programs enable row level security;

-- Seed/update the Ambewela route program used by Priyadarshana Distributors.
-- day_of_week follows ISO numbering: 1 Monday through 7 Sunday.
with route_list (
  territory_name,
  day_of_week,
  frequency_label,
  route_name,
  route_description,
  is_active
) as (
  values
    ('ELPITIYA', 1, '2x', 'ELPITIYA TOWN', 'Ambewela route program - Monday', true),
    ('ELPITIYA', 2, '1x', 'IGALKANDA,KURUDUGAHA UPTO BATAPOLA JUNCTION', 'Ambewela route program - Tuesday', true),
    ('ELPITIYA', 3, '1x', 'THANABADDEGAMA,KAHADUWA,THALGASWALA UPTO PITOGALA', 'Ambewela route program - Wednesday', true),
    ('ELPITIYA', 4, '1x', 'BATAPOLA JUNCTION,BADDEGAMA BRIDGE UPTO GONAPINUWALA JUNCTION', 'Ambewela route program - Thursday', true),
    ('ELPITIYA', 5, '2x', 'ELPITIYA TOWN', 'Ambewela route program - Friday', true),
    ('ELPITIYA', 6, '1x', 'ELPITIYA UP TO PITIGALA', 'Ambewela route program - Saturday', true)
),
target_organization as (
  select id
  from public.organizations
  order by created_at asc
  limit 1
),
updated_routes as (
  update public.route_programs rp
  set
    frequency_label = route_list.frequency_label,
    route_description = route_list.route_description,
    is_active = route_list.is_active,
    updated_at = timezone('utc', now())
  from route_list
  cross join target_organization
  where rp.organization_id = target_organization.id
    and upper(trim(rp.territory_name)) = route_list.territory_name
    and rp.day_of_week = route_list.day_of_week
    and upper(trim(rp.route_name)) = route_list.route_name
  returning
    rp.organization_id,
    upper(trim(rp.territory_name)) as territory_name,
    rp.day_of_week,
    upper(trim(rp.route_name)) as route_name
)
insert into public.route_programs (
  organization_id,
  territory_name,
  day_of_week,
  frequency_label,
  route_name,
  route_description,
  is_active
)
select
  target_organization.id,
  route_list.territory_name,
  route_list.day_of_week,
  route_list.frequency_label,
  route_list.route_name,
  route_list.route_description,
  route_list.is_active
from route_list
cross join target_organization
where not exists (
  select 1
  from updated_routes ur
  where ur.organization_id = target_organization.id
    and ur.territory_name = route_list.territory_name
    and ur.day_of_week = route_list.day_of_week
    and ur.route_name = route_list.route_name
)
and not exists (
  select 1
  from public.route_programs rp
  where rp.organization_id = target_organization.id
    and upper(trim(rp.territory_name)) = route_list.territory_name
    and rp.day_of_week = route_list.day_of_week
    and upper(trim(rp.route_name)) = route_list.route_name
);

commit;
