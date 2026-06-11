begin;

-- ---------------------------------------------------------------------------
-- 1. Extend Inventory Transactions Types
-- ---------------------------------------------------------------------------

alter table public.inventory_transactions drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions add constraint inventory_transactions_type_check check (
  transaction_type in ('RECEIPT', 'LOAD_OUT', 'LORRY_RETURN', 'ADJUSTMENT', 'LOAD_OUT_REVERT', 'LORRY_RETURN_REVERT')
);

-- ---------------------------------------------------------------------------
-- 2. Strict Load Out Locking for Inventory Edits
-- ---------------------------------------------------------------------------

create or replace function public.assert_daily_report_inventory_entries_editable(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  target_report public.daily_reports%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_report
  from public.daily_reports
  where id = target_daily_report_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if target_report.status <> 'draft' then
    raise exception 'Inventory entries can only be edited while the daily report is in draft status.' using errcode = 'P0001';
  end if;

  if target_report.loading_completed_at is not null then
    raise exception 'Loading has been finalized. You must revert loading before editing inventory entries.' using errcode = 'P0001';
  end if;

  if actor_role = 'driver' and target_report.prepared_by <> actor_id then
    raise exception 'Drivers can only edit inventory entries on their own reports.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor', 'driver') then
    raise exception 'You are not allowed to edit inventory entries.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Revert Loading Summary (Un-finalize)
-- ---------------------------------------------------------------------------

create or replace function public.revert_loading_summary(
  p_summary_id uuid
)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  v_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can revert loading summaries.' using errcode = '42501';
  end if;

  select dr.* into v_report
  from public.daily_reports dr
  where dr.id = p_summary_id
  for update;

  if not found then
    raise exception 'Loading summary not found.' using errcode = 'P0002';
  end if;

  if v_report.status <> 'draft' then
    raise exception 'Only draft reports can have loading reverted.' using errcode = 'P0001';
  end if;

  if v_report.loading_completed_at is null then
    raise exception 'Loading has not been finalized yet.' using errcode = 'P0001';
  end if;

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  -- Return inventory for each loading entry
  for v_entry in 
    select product_id, loading_qty 
    from public.report_inventory_entries 
    where daily_report_id = p_summary_id and loading_qty > 0
  loop
    -- Upsert and return stock
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity + v_entry.loading_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, v_entry.loading_qty, 'LOAD_OUT_REVERT', p_summary_id, actor_id
    );
  end loop;

  -- Update report
  update public.daily_reports
  set
    loading_completed_at = null,
    loading_completed_by = null
  where id = p_summary_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reopen Daily Report (Revert Returns)
-- ---------------------------------------------------------------------------

create or replace function public.reopen_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
  v_org_id uuid;
  v_entry record;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if current_report.status = 'draft' then
    raise exception 'Draft reports are already open.' using errcode = 'P0001';
  end if;

  if current_report.status = 'approved' and actor_role <> 'admin' then
    raise exception 'Only admin can reopen approved reports.' using errcode = '42501';
  end if;

  if current_report.status in ('submitted', 'rejected') and actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can reopen submitted or rejected reports.' using errcode = '42501';
  end if;

  -- If returning from 'approved', we must REVERT the lorry returns from main_inventory
  if current_report.status = 'approved' then
    -- Get organization_id from route_program
    select organization_id into v_org_id
    from public.route_programs
    where id = current_report.route_program_id;

    for v_entry in 
      select product_id, lorry_qty 
      from public.report_inventory_entries 
      where daily_report_id = target_report_id and lorry_qty > 0
    loop
      -- Upsert and DEDUCT returned stock
      insert into public.main_inventory (organization_id, product_id, quantity)
      values (v_org_id, v_entry.product_id, -v_entry.lorry_qty)
      on conflict (organization_id, product_id)
      do update set quantity = public.main_inventory.quantity - v_entry.lorry_qty, updated_at = timezone('utc', now());

      -- Log transaction
      insert into public.inventory_transactions (
        organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
      ) values (
        v_org_id, v_entry.product_id, -v_entry.lorry_qty, 'LORRY_RETURN_REVERT', target_report_id, actor_id
      );
    end loop;
  end if;

  update public.daily_reports
  set
    status = 'draft',
    submitted_at = null,
    submitted_by = null,
    approved_at = null,
    approved_by = null,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Manual Main Inventory Adjustment
-- ---------------------------------------------------------------------------

create or replace function public.adjust_main_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity_change integer,
  p_notes text default null
)
returns public.main_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  v_new_inventory public.main_inventory%rowtype;
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can manually adjust inventory.' using errcode = '42501';
  end if;

  if p_quantity_change = 0 then
    raise exception 'Quantity change must be non-zero.' using errcode = 'P0001';
  end if;

  -- Upsert into main_inventory
  insert into public.main_inventory (organization_id, product_id, quantity)
  values (p_organization_id, p_product_id, p_quantity_change)
  on conflict (organization_id, product_id)
  do update set quantity = public.main_inventory.quantity + p_quantity_change, updated_at = timezone('utc', now())
  returning * into v_new_inventory;

  -- Log transaction
  insert into public.inventory_transactions (
    organization_id, product_id, quantity_change, transaction_type, notes, created_by
  ) values (
    p_organization_id, p_product_id, p_quantity_change, 'ADJUSTMENT', p_notes, actor_id
  );

  return v_new_inventory;
end;
$$;

commit;
