begin;

-- Customer finance history layer.
-- Builds on 0042 by connecting route-day finance rows to customer credit
-- accounts, aging, customer matching, collections, and immutable events.

alter table public.organizations
  add column if not exists default_credit_days integer not null default 7
  check (default_credit_days >= 0 and default_credit_days <= 365);

alter table public.customers
  add column if not exists credit_days integer not null default 7
  check (credit_days >= 0 and credit_days <= 365),
  add column if not exists credit_limit numeric(14,2) not null default 0
  check (credit_limit >= 0),
  add column if not exists credit_status text not null default 'active'
  check (credit_status in ('active', 'hold', 'blocked'));

alter table public.customer_credit_accounts
  add column if not exists default_credit_days integer not null default 7
  check (default_credit_days >= 0 and default_credit_days <= 365),
  add column if not exists credit_status text not null default 'active'
  check (credit_status in ('active', 'hold', 'blocked'));

create table if not exists public.unmatched_customer_outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'flat_data',
  source_outlet_id text,
  outlet_name text not null,
  normalized_outlet_name text generated always as (lower(trim(outlet_name))) stored,
  route_name text,
  first_seen_report_id uuid references public.daily_reports(id) on delete set null,
  last_seen_report_id uuid references public.daily_reports(id) on delete set null,
  suggested_customer_id uuid references public.customers(id) on delete set null,
  resolved_customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'created', 'ignored')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, normalized_outlet_name)
);

create table if not exists public.finance_ledger_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  daily_report_id uuid references public.daily_reports(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_credit_account_id uuid references public.customer_credit_accounts(id) on delete set null,
  amount numeric(14,2),
  status_from text,
  status_to text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_unmatched_customer_outlets_updated_at on public.unmatched_customer_outlets;
create trigger set_unmatched_customer_outlets_updated_at
before update on public.unmatched_customer_outlets
for each row execute procedure public.set_updated_at();

alter table public.unmatched_customer_outlets enable row level security;
alter table public.finance_ledger_events enable row level security;

drop policy if exists unmatched_customer_outlets_select_policy on public.unmatched_customer_outlets;
create policy unmatched_customer_outlets_select_policy
on public.unmatched_customer_outlets
for select to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'view', organization_id)
);

drop policy if exists unmatched_customer_outlets_write_policy on public.unmatched_customer_outlets;
create policy unmatched_customer_outlets_write_policy
on public.unmatched_customer_outlets
for all to authenticated
using (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
)
with check (
  public.user_has_org_access(organization_id)
  and public.user_has_feature_permission('customers', 'edit', organization_id)
);

drop policy if exists finance_ledger_events_select_policy on public.finance_ledger_events;
create policy finance_ledger_events_select_policy
on public.finance_ledger_events
for select to authenticated
using (
  public.user_has_org_access(organization_id)
  and (
    public.user_has_feature_permission('customers', 'view', organization_id)
    or public.user_has_feature_permission('date_sheet', 'view', organization_id)
  )
);

create or replace function public.normalize_customer_name(input text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(input, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.credit_aging_bucket(target_due_date date, target_status text, target_outstanding numeric)
returns text
language sql
stable
as $$
  select case
    when coalesce(target_outstanding, 0) <= 0 or target_status in ('settled', 'written_off') then 'settled'
    when target_due_date is null then 'unassigned'
    when target_due_date > current_date then 'current'
    when target_due_date = current_date then 'due_today'
    when current_date - target_due_date between 1 and 7 then '1_7'
    when current_date - target_due_date between 8 and 14 then '8_14'
    when current_date - target_due_date between 15 and 30 then '15_30'
    when current_date - target_due_date between 31 and 60 then '31_60'
    when current_date - target_due_date between 61 and 90 then '61_90'
    else '90_plus'
  end;
$$;

create or replace function public.log_finance_event(
  target_organization_id uuid,
  target_event_type text,
  target_entity_type text,
  target_entity_id uuid,
  target_daily_report_id uuid default null,
  target_customer_id uuid default null,
  target_customer_credit_account_id uuid default null,
  target_amount numeric default null,
  target_status_from text default null,
  target_status_to text default null,
  target_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_ledger_events (
    organization_id,
    event_type,
    entity_type,
    entity_id,
    daily_report_id,
    customer_id,
    customer_credit_account_id,
    amount,
    status_from,
    status_to,
    details,
    created_by
  ) values (
    target_organization_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    target_daily_report_id,
    target_customer_id,
    target_customer_credit_account_id,
    target_amount,
    target_status_from,
    target_status_to,
    coalesce(target_details, '{}'::jsonb),
    auth.uid()
  );
end;
$$;

create or replace function public.sync_finance_ledgers_for_report(target_daily_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  item record;
  v_account_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_credit_days integer;
begin
  select public.finance_report_organization_id(target_daily_report_id) into v_org_id;

  if v_org_id is null then
    raise exception 'Report organization was not found.' using errcode = 'P0002';
  end if;

  insert into public.report_bills (
    daily_report_id,
    invoice_entry_id,
    invoice_no,
    customer_name,
    amount_snapshot,
    status
  )
  select
    rie.daily_report_id,
    rie.id,
    rie.invoice_no,
    nullif(trim(rie.notes), ''),
    round(coalesce(rie.cash_amount, 0) + coalesce(rie.cheque_amount, 0) + coalesce(rie.credit_amount, 0), 2),
    'delivered'
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_daily_report_id
  on conflict (daily_report_id, invoice_no)
  do update set
    invoice_entry_id = excluded.invoice_entry_id,
    customer_name = coalesce(excluded.customer_name, public.report_bills.customer_name),
    amount_snapshot = excluded.amount_snapshot,
    updated_at = timezone('utc', now());

  for item in
    select *
    from public.report_invoice_entries rie
    where rie.daily_report_id = target_daily_report_id
      and rie.credit_amount > 0
  loop
    v_customer_name := coalesce(nullif(trim(item.notes), ''), 'Unknown Credit Customer');
    v_customer_id := null;
    v_credit_days := null;

    -- First honor any reviewed Flat Data outlet match. This lets admins link
    -- "shop/outlet" names from the mother-company file to the clean customer
    -- master once, then all future imports follow that decision.
    select c.id, c.name, c.credit_days
    into v_customer_id, v_customer_name, v_credit_days
    from public.unmatched_customer_outlets uco
    join public.customers c
      on c.id = uco.resolved_customer_id
     and c.organization_id = uco.organization_id
    where uco.organization_id = v_org_id
      and uco.status in ('linked', 'created')
      and public.normalize_customer_name(uco.outlet_name) = public.normalize_customer_name(v_customer_name)
    order by uco.resolved_at desc nulls last, uco.updated_at desc
    limit 1;

    if v_customer_id is null then
      select c.id, c.name, c.credit_days
      into v_customer_id, v_customer_name, v_credit_days
      from public.customers c
      where c.organization_id = v_org_id
        and public.normalize_customer_name(c.name) = public.normalize_customer_name(v_customer_name)
      order by c.updated_at desc
      limit 1;
    end if;

    if v_customer_id is null then
      insert into public.unmatched_customer_outlets (
        organization_id,
        outlet_name,
        first_seen_report_id,
        last_seen_report_id,
        status
      ) values (
        v_org_id,
        v_customer_name,
        target_daily_report_id,
        target_daily_report_id,
        'pending'
      )
      on conflict (organization_id, normalized_outlet_name)
      do update set
        last_seen_report_id = excluded.last_seen_report_id,
        updated_at = timezone('utc', now());
    end if;

    insert into public.customer_credit_accounts (
      organization_id,
      customer_id,
      customer_name,
      default_credit_days,
      credit_limit,
      credit_status
    ) values (
      v_org_id,
      v_customer_id,
      v_customer_name,
      coalesce(v_credit_days, (select default_credit_days from public.organizations where id = v_org_id), 7),
      coalesce((select credit_limit from public.customers where id = v_customer_id), 0),
      coalesce((select credit_status from public.customers where id = v_customer_id), 'active')
    )
    on conflict (organization_id, normalized_customer_name)
    do update set
      customer_id = coalesce(excluded.customer_id, public.customer_credit_accounts.customer_id),
      default_credit_days = excluded.default_credit_days,
      credit_limit = excluded.credit_limit,
      credit_status = excluded.credit_status,
      updated_at = timezone('utc', now())
    returning id into v_account_id;

    insert into public.credit_invoices (
      organization_id,
      daily_report_id,
      invoice_entry_id,
      credit_account_id,
      invoice_no,
      customer_name,
      invoice_date,
      due_date,
      amount,
      collected_amount,
      status
    ) values (
      v_org_id,
      target_daily_report_id,
      item.id,
      v_account_id,
      item.invoice_no,
      v_customer_name,
      current_date,
      current_date + coalesce(v_credit_days, (select default_credit_days from public.organizations where id = v_org_id), 7),
      item.credit_amount,
      0,
      'open'
    )
    on conflict (organization_id, invoice_no)
    do update set
      daily_report_id = excluded.daily_report_id,
      invoice_entry_id = excluded.invoice_entry_id,
      credit_account_id = excluded.credit_account_id,
      customer_name = excluded.customer_name,
      amount = excluded.amount,
      due_date = coalesce(public.credit_invoices.due_date, excluded.due_date),
      status = case
        when public.credit_invoices.collected_amount >= excluded.amount then 'settled'
        when public.credit_invoices.collected_amount > 0 then 'partially_paid'
        else 'open'
      end,
      updated_at = timezone('utc', now());
  end loop;
end;
$$;

create or replace function public.post_credit_collection(
  target_credit_invoice_id uuid,
  collection_amount numeric,
  collection_method text,
  collection_reference text default null,
  collection_notes text default null,
  collection_date date default current_date
)
returns public.credit_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.credit_invoices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id
  for update;

  if not found then
    raise exception 'Credit invoice not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'edit', invoice_row.organization_id) then
    raise exception 'Missing permission to post credit collections.' using errcode = '42501';
  end if;

  if collection_amount <= 0 or collection_amount > invoice_row.outstanding_amount then
    raise exception 'Collection amount must be positive and cannot exceed outstanding balance.' using errcode = '23514';
  end if;

  if collection_method not in ('cash', 'cheque', 'bank', 'other') then
    raise exception 'Invalid credit collection payment method.' using errcode = '23514';
  end if;

  insert into public.credit_collections (
    organization_id,
    credit_invoice_id,
    collected_at,
    amount,
    payment_method,
    reference_no,
    notes,
    created_by
  ) values (
    invoice_row.organization_id,
    invoice_row.id,
    coalesce(collection_date, current_date),
    collection_amount,
    collection_method,
    nullif(trim(collection_reference), ''),
    nullif(trim(collection_notes), ''),
    auth.uid()
  );

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id;

  perform public.log_finance_event(
    invoice_row.organization_id,
    'credit_collection_posted',
    'credit_invoice',
    invoice_row.id,
    invoice_row.daily_report_id,
    null,
    invoice_row.credit_account_id,
    collection_amount,
    null,
    invoice_row.status,
    jsonb_build_object('method', collection_method, 'reference', collection_reference)
  );

  return invoice_row;
end;
$$;

create or replace function public.update_credit_invoice_status(
  target_credit_invoice_id uuid,
  target_status text,
  status_notes text default null
)
returns public.credit_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.credit_invoices%rowtype;
  previous_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.credit_invoices
  where id = target_credit_invoice_id
  for update;

  if not found then
    raise exception 'Credit invoice not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('date_sheet', 'approve', invoice_row.organization_id) then
    raise exception 'Missing permission to update credit invoice status.' using errcode = '42501';
  end if;

  if target_status not in ('open', 'partially_paid', 'settled', 'written_off', 'disputed') then
    raise exception 'Invalid credit invoice status.' using errcode = '23514';
  end if;

  if target_status = 'settled' and invoice_row.outstanding_amount > 0 then
    raise exception 'Credit invoice can only be manually settled when outstanding balance is zero.' using errcode = '23514';
  end if;

  previous_status := invoice_row.status;

  update public.credit_invoices
  set
    status = target_status,
    notes = coalesce(nullif(trim(status_notes), ''), notes),
    updated_at = timezone('utc', now())
  where id = target_credit_invoice_id
  returning * into invoice_row;

  perform public.log_finance_event(
    invoice_row.organization_id,
    'credit_status_changed',
    'credit_invoice',
    invoice_row.id,
    invoice_row.daily_report_id,
    null,
    invoice_row.credit_account_id,
    null,
    previous_status,
    target_status,
    jsonb_build_object('notes', status_notes)
  );

  return invoice_row;
end;
$$;

create or replace function public.update_report_cheque_status(
  target_cheque_id uuid,
  target_status text,
  status_notes text default null
)
returns public.report_cheques
language plpgsql
security definer
set search_path = public
as $$
declare
  cheque_row public.report_cheques%rowtype;
  previous_status text;
  org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into cheque_row
  from public.report_cheques
  where id = target_cheque_id
  for update;

  if not found then
    raise exception 'Cheque not found.' using errcode = 'P0002';
  end if;

  select public.finance_report_organization_id(cheque_row.daily_report_id) into org_id;

  if not public.user_has_feature_permission('date_sheet', 'edit', org_id) then
    raise exception 'Missing permission to update cheque status.' using errcode = '42501';
  end if;

  if target_status not in ('received', 'deposited', 'realized', 'bounced', 'returned', 'cancelled') then
    raise exception 'Invalid cheque status.' using errcode = '23514';
  end if;

  previous_status := cheque_row.status;

  update public.report_cheques
  set
    status = target_status,
    notes = coalesce(nullif(trim(status_notes), ''), notes),
    updated_at = timezone('utc', now())
  where id = target_cheque_id
  returning * into cheque_row;

  perform public.log_finance_event(
    org_id,
    'cheque_status_changed',
    'report_cheque',
    cheque_row.id,
    cheque_row.daily_report_id,
    null,
    null,
    cheque_row.amount,
    previous_status,
    target_status,
    jsonb_build_object('notes', status_notes, 'chequeNo', cheque_row.cheque_no)
  );

  return cheque_row;
end;
$$;

create or replace function public.resolve_unmatched_customer_outlet(
  target_match_id uuid,
  target_action text,
  target_customer_id uuid default null
)
returns public.unmatched_customer_outlets
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.unmatched_customer_outlets%rowtype;
  customer_row public.customers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into match_row
  from public.unmatched_customer_outlets
  where id = target_match_id
  for update;

  if not found then
    raise exception 'Unmatched customer record not found.' using errcode = 'P0002';
  end if;

  if not public.user_has_feature_permission('customers', 'edit', match_row.organization_id) then
    raise exception 'Missing permission to resolve customer matches.' using errcode = '42501';
  end if;

  if target_action not in ('link', 'create', 'ignore') then
    raise exception 'Invalid customer match action.' using errcode = '23514';
  end if;

  if target_action = 'link' then
    select * into customer_row
    from public.customers
    where id = target_customer_id
      and organization_id = match_row.organization_id;

    if not found then
      raise exception 'Selected customer was not found in this organization.' using errcode = '23503';
    end if;

    update public.unmatched_customer_outlets
    set
      resolved_customer_id = customer_row.id,
      status = 'linked',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  elsif target_action = 'create' then
    insert into public.customers (
      organization_id,
      code,
      name,
      channel,
      status
    ) values (
      match_row.organization_id,
      'AUTO-' || upper(substr(replace(match_row.id::text, '-', ''), 1, 8)),
      match_row.outlet_name,
      'RETAIL',
      'ACTIVE'
    )
    returning * into customer_row;

    update public.unmatched_customer_outlets
    set
      resolved_customer_id = customer_row.id,
      status = 'created',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  else
    update public.unmatched_customer_outlets
    set
      status = 'ignored',
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
    where id = target_match_id
    returning * into match_row;
  end if;

  if target_action in ('link', 'create') then
    update public.customer_credit_accounts
    set
      customer_id = customer_row.id,
      customer_name = customer_row.name,
      default_credit_days = customer_row.credit_days,
      credit_limit = customer_row.credit_limit,
      credit_status = customer_row.credit_status,
      updated_at = timezone('utc', now())
    where organization_id = match_row.organization_id
      and public.normalize_customer_name(customer_name) = public.normalize_customer_name(match_row.outlet_name);

    update public.credit_invoices ci
    set
      customer_name = customer_row.name,
      updated_at = timezone('utc', now())
    from public.customer_credit_accounts cca
    where ci.credit_account_id = cca.id
      and ci.organization_id = match_row.organization_id
      and cca.customer_id = customer_row.id;
  end if;

  return match_row;
end;
$$;

create index if not exists customers_org_credit_status_idx on public.customers (organization_id, credit_status);
create index if not exists credit_invoices_org_due_status_idx on public.credit_invoices (organization_id, due_date, status);
create index if not exists credit_invoices_account_status_idx on public.credit_invoices (credit_account_id, status);
create index if not exists finance_ledger_events_org_created_idx on public.finance_ledger_events (organization_id, created_at desc);
create index if not exists unmatched_customer_outlets_org_status_idx on public.unmatched_customer_outlets (organization_id, status, updated_at desc);

grant execute on function public.post_credit_collection(uuid, numeric, text, text, text, date) to authenticated;
grant execute on function public.update_credit_invoice_status(uuid, text, text) to authenticated;
grant execute on function public.update_report_cheque_status(uuid, text, text) to authenticated;
grant execute on function public.resolve_unmatched_customer_outlet(uuid, text, uuid) to authenticated;

comment on table public.unmatched_customer_outlets is 'Review queue for Flat Data outlet/customer names that do not yet match customer master records.';
comment on table public.finance_ledger_events is 'Immutable finance event history across credit, cheques, bills, expenses, cash adjustments, collections, and payroll.';
comment on function public.credit_aging_bucket(date, text, numeric) is 'Classifies open receivables into accounts-receivable aging buckets.';

commit;
