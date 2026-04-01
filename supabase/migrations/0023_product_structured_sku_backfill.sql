begin;

create or replace function public.parse_legacy_product_pack_pattern(raw_name text)
returns table (
  parsed_family text,
  parsed_unit_size numeric,
  parsed_unit_measure text,
  parsed_pack_size integer,
  confidence text
)
language plpgsql
immutable
as $$
declare
  normalized text;
  matches text[];
begin
  normalized := regexp_replace(trim(coalesce(raw_name, '')), '\s+', ' ', 'g');

  if normalized = '' then
    return;
  end if;

  matches := regexp_match(
    normalized,
    '^(.*?)(?:\s+)?(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\s*[xX×]\s*(\d+)\s*$',
    'i'
  );

  if matches is null then
    return;
  end if;

  parsed_family := nullif(trim(matches[1]), '');
  parsed_unit_size := matches[2]::numeric;
  parsed_unit_measure := lower(matches[3]);
  parsed_pack_size := matches[4]::integer;
  confidence := case
    when parsed_family is null then 'pack_suffix_only'
    else 'pack_suffix_with_family'
  end;

  return next;
end;
$$;

comment on function public.parse_legacy_product_pack_pattern(text) is 'Conservative one-time migration helper that extracts unit size, measure, and pack size from legacy product names only when the pattern is confidently recognized.';

with parsed_candidates as (
  select
    p.id,
    parsed.parsed_family,
    parsed.parsed_unit_size,
    parsed.parsed_unit_measure,
    parsed.parsed_pack_size,
    parsed.confidence
  from public.products p
  cross join lateral public.parse_legacy_product_pack_pattern(
    coalesce(
      nullif(trim(p.product_name), ''),
      nullif(trim(p.display_name), ''),
      nullif(trim(p.name), '')
    )
  ) parsed
)
update public.products p
set
  unit_size = coalesce(p.unit_size, parsed.parsed_unit_size),
  unit_measure = coalesce(p.unit_measure, parsed.parsed_unit_measure),
  pack_size = coalesce(p.pack_size, parsed.parsed_pack_size),
  product_family = case
    when parsed.parsed_family is not null
      and (
        p.product_family is null
        or nullif(trim(p.product_family), '') is null
        or trim(p.product_family) = trim(p.product_name)
        or trim(p.product_family) = trim(p.display_name)
      )
      then parsed.parsed_family
    else p.product_family
  end,
  display_name = coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(p.product_name), ''),
    nullif(trim(p.name), ''),
    p.product_family
  )
from parsed_candidates parsed
where parsed.id = p.id
  and (
    p.unit_size is null
    or p.unit_measure is null
    or p.pack_size is null
    or (
      parsed.parsed_family is not null
      and (
        p.product_family is null
        or nullif(trim(p.product_family), '') is null
        or trim(p.product_family) = trim(p.product_name)
        or trim(p.product_family) = trim(p.display_name)
      )
    )
  );

drop view if exists public.product_structuring_backfill_review;
create view public.product_structuring_backfill_review as
select
  p.id,
  p.organization_id,
  p.product_code,
  p.product_name,
  p.display_name,
  p.product_family,
  p.variant,
  p.unit_size,
  p.unit_measure,
  p.pack_size,
  p.selling_unit,
  case
    when p.unit_size is not null and p.unit_measure is not null and p.pack_size is not null then 'structured_or_confidently_parsed'
    when exists (
      select 1
      from public.parse_legacy_product_pack_pattern(coalesce(nullif(trim(p.product_name), ''), nullif(trim(p.display_name), ''), nullif(trim(p.name), ''))) parsed
    ) then 'partially_structured_review_recommended'
    else 'manual_review_required'
  end as migration_status
from public.products p;

comment on view public.product_structuring_backfill_review is 'Review helper for gradual SKU structuring. Rows marked manual_review_required were intentionally left conservative by the backfill.';

grant select on public.product_structuring_backfill_review to authenticated;

commit;
