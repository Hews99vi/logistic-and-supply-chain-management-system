begin;

-- ---------------------------------------------------------------------------
-- Main Inventory (Outside Freezer) Tracking
-- ---------------------------------------------------------------------------

create table if not exists public.main_inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint main_inventory_unique_org_product unique (organization_id, product_id)
);

comment on table public.main_inventory is 'Tracks the central stock (outside freezer) per product for each organization.';
comment on column public.main_inventory.quantity is 'Current stock level. Allowed to go negative to support post-reconciliation workflows.';

drop trigger if exists set_main_inventory_updated_at on public.main_inventory;
create trigger set_main_inventory_updated_at
before update on public.main_inventory
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory Transactions Audit Log
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_change integer not null,
  transaction_type text not null,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles(id) on delete set null,
  constraint inventory_transactions_type_check check (
    transaction_type in ('RECEIPT', 'LOAD_OUT', 'LORRY_RETURN', 'ADJUSTMENT')
  )
);

comment on table public.inventory_transactions is 'Audit log for all IN/OUT/ADJUST movements affecting main_inventory.';

create index if not exists inventory_transactions_org_product_idx on public.inventory_transactions (organization_id, product_id);
create index if not exists inventory_transactions_reference_idx on public.inventory_transactions (reference_id);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

alter table public.main_inventory enable row level security;
alter table public.inventory_transactions enable row level security;

-- main_inventory policies
drop policy if exists main_inventory_select_policy on public.main_inventory;
create policy main_inventory_select_policy
on public.main_inventory
for select
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

drop policy if exists main_inventory_insert_policy on public.main_inventory;
create policy main_inventory_insert_policy
on public.main_inventory
for insert
to authenticated
with check (organization_id = any(public.current_user_organization_ids()));

drop policy if exists main_inventory_update_policy on public.main_inventory;
create policy main_inventory_update_policy
on public.main_inventory
for update
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

-- inventory_transactions policies
drop policy if exists inventory_transactions_select_policy on public.inventory_transactions;
create policy inventory_transactions_select_policy
on public.inventory_transactions
for select
to authenticated
using (organization_id = any(public.current_user_organization_ids()));

drop policy if exists inventory_transactions_insert_policy on public.inventory_transactions;
create policy inventory_transactions_insert_policy
on public.inventory_transactions
for insert
to authenticated
with check (organization_id = any(public.current_user_organization_ids()));


-- ---------------------------------------------------------------------------
-- RPC: Receive Main Inventory (Direct stock receipts)
-- ---------------------------------------------------------------------------

create or replace function public.receive_main_inventory(
  p_organization_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_notes text default null
)
returns public.main_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  v_new_inventory public.main_inventory%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero.' using errcode = 'P0001';
  end if;

  -- Upsert into main_inventory
  insert into public.main_inventory (organization_id, product_id, quantity)
  values (p_organization_id, p_product_id, p_quantity)
  on conflict (organization_id, product_id)
  do update set quantity = public.main_inventory.quantity + p_quantity, updated_at = timezone('utc', now())
  returning * into v_new_inventory;

  -- Log transaction
  insert into public.inventory_transactions (
    organization_id, product_id, quantity_change, transaction_type, notes, created_by
  ) values (
    p_organization_id, p_product_id, p_quantity, 'RECEIPT', p_notes, actor_id
  );

  return v_new_inventory;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Finalize Loading Summary (Deduct stock)
-- ---------------------------------------------------------------------------

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

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = v_report.route_program_id;

  -- Deduct inventory for each loading entry
  for v_entry in 
    select product_id, loading_qty 
    from public.report_inventory_entries 
    where daily_report_id = p_summary_id and loading_qty > 0
  loop
    -- Upsert and deduct stock (allowing negative)
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, -v_entry.loading_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity - v_entry.loading_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, -v_entry.loading_qty, 'LOAD_OUT', p_summary_id, actor_id
    );
  end loop;

  -- Update report
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

-- ---------------------------------------------------------------------------
-- Update approve_daily_report to Handle Lorry Returns
-- ---------------------------------------------------------------------------

create or replace function public.approve_daily_report(target_report_id uuid)
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

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can approve reports.' using errcode = '42501';
  end if;

  select *
  into current_report
  from public.daily_reports
  where id = target_report_id
  for update;

  if not found then
    raise exception 'Daily report not found.' using errcode = 'P0002';
  end if;

  if current_report.status <> 'submitted' then
    raise exception 'Only submitted reports can be approved.' using errcode = 'P0001';
  end if;

  -- Get organization_id from route_program
  select organization_id into v_org_id
  from public.route_programs
  where id = current_report.route_program_id;

  -- Add returned lorry stock back to main inventory
  for v_entry in 
    select product_id, lorry_qty 
    from public.report_inventory_entries 
    where daily_report_id = target_report_id and lorry_qty > 0
  loop
    -- Upsert and add stock
    insert into public.main_inventory (organization_id, product_id, quantity)
    values (v_org_id, v_entry.product_id, v_entry.lorry_qty)
    on conflict (organization_id, product_id)
    do update set quantity = public.main_inventory.quantity + v_entry.lorry_qty, updated_at = timezone('utc', now());

    -- Log transaction
    insert into public.inventory_transactions (
      organization_id, product_id, quantity_change, transaction_type, reference_id, created_by
    ) values (
      v_org_id, v_entry.product_id, v_entry.lorry_qty, 'LORRY_RETURN', target_report_id, actor_id
    );
  end loop;

  update public.daily_reports
  set
    status = 'approved',
    approved_at = timezone('utc', now()),
    approved_by = actor_id,
    rejected_at = null,
    rejected_by = null,
    rejection_reason = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

commit;
