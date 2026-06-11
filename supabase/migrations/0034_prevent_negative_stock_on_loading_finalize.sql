begin;

create or replace function public.finalize_loading_summary(
  p_summary_id uuid,
  p_loading_notes text default null
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
  v_available_qty integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft loading summaries can be finalized.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is not null then
    raise exception 'Loading has already been finalized.' using errcode = 'P0001';
  end if;

  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  if v_org_id is null then
    raise exception 'Route organization was not found for this loading summary.' using errcode = 'P0002';
  end if;

  for v_entry in
    select
      rie.product_id,
      rie.loading_qty,
      coalesce(rie.product_display_name_snapshot, rie.product_name_snapshot, rie.product_code_snapshot) as product_label
    from public.report_inventory_entries rie
    where rie.daily_report_id = p_summary_id
      and rie.loading_qty > 0
  loop
    select coalesce(mi.quantity, 0)
    into v_available_qty
    from public.main_inventory mi
    where mi.organization_id = v_org_id
      and mi.product_id = v_entry.product_id
    for update;

    v_available_qty := coalesce(v_available_qty, 0);

    if v_available_qty < v_entry.loading_qty then
      raise exception 'Insufficient main stock for %. Available %, requested %.',
        v_entry.product_label,
        v_available_qty,
        v_entry.loading_qty
        using errcode = '23514';
    end if;
  end loop;

  for v_entry in
    select product_id, loading_qty
    from public.report_inventory_entries
    where daily_report_id = p_summary_id
      and loading_qty > 0
  loop
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, -v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set
      quantity = public.main_inventory.quantity - v_entry.loading_qty,
      updated_at = timezone('utc', now());

    insert into public.inventory_transactions (
      organization_id,
      product_id,
      quantity_change,
      transaction_type,
      reference_id,
      created_by
    ) values (
      v_org_id,
      v_entry.product_id,
      -v_entry.loading_qty,
      'LOAD_OUT',
      p_summary_id,
      actor_id
    );
  end loop;

  update public.daily_reports
  set
    loading_completed_at = timezone('utc', now()),
    loading_completed_by = actor_id,
    loading_notes = coalesce(p_loading_notes, v_report.loading_notes)
  where id = p_summary_id
  returning * into v_report;

  return v_report;
end;
$$;

comment on function public.finalize_loading_summary(uuid, text) is 'Finalizes loading after confirming main inventory has enough stock, then deducts loaded quantities.';

commit;
