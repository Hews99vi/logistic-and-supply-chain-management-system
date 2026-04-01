begin;

-- ---------------------------------------------------------------------------
-- Extend daily_reports with workflow audit fields.
-- ---------------------------------------------------------------------------
alter table public.daily_reports
  add column if not exists rejection_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete restrict;

alter table public.daily_reports
  drop constraint if exists daily_reports_rejection_reason_check;

alter table public.daily_reports
  add constraint daily_reports_rejection_reason_check check (
    status <> 'rejected' or nullif(trim(rejection_reason), '') is not null
  );

comment on column public.daily_reports.rejection_reason is 'Supervisor or admin provided reason when a report is rejected.';
comment on column public.daily_reports.submitted_at is 'Timestamp when the report moved to submitted.';
comment on column public.daily_reports.submitted_by is 'User who submitted the report.';
comment on column public.daily_reports.approved_at is 'Timestamp when the report was approved.';
comment on column public.daily_reports.approved_by is 'User who approved the report.';
comment on column public.daily_reports.rejected_at is 'Timestamp when the report was rejected.';
comment on column public.daily_reports.rejected_by is 'User who rejected the report.';

-- ---------------------------------------------------------------------------
-- Workflow validation trigger for direct updates.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_daily_report_workflow_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  actor_id uuid;
begin
  actor_id := auth.uid();
  actor_role := public.current_user_role();

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = 'approved' and actor_role <> 'admin' then
    if row(
      new.report_date,
      new.route_program_id,
      new.prepared_by,
      new.staff_name,
      new.territory_name_snapshot,
      new.route_name_snapshot,
      new.remarks,
      new.total_cash,
      new.total_cheques,
      new.total_credit,
      new.total_expenses,
      new.day_sale_total,
      new.total_sale,
      new.db_margin_percent,
      new.db_margin_value,
      new.net_profit,
      new.cash_in_hand,
      new.cash_in_bank,
      new.cash_book_total,
      new.cash_physical_total,
      new.cash_difference,
      new.total_bill_count,
      new.delivered_bill_count,
      new.cancelled_bill_count
    )
    is distinct from
    row(
      old.report_date,
      old.route_program_id,
      old.prepared_by,
      old.staff_name,
      old.territory_name_snapshot,
      old.route_name_snapshot,
      old.remarks,
      old.total_cash,
      old.total_cheques,
      old.total_credit,
      old.total_expenses,
      old.day_sale_total,
      old.total_sale,
      old.db_margin_percent,
      old.db_margin_value,
      old.net_profit,
      old.cash_in_hand,
      old.cash_in_bank,
      old.cash_book_total,
      old.cash_physical_total,
      old.cash_difference,
      old.total_bill_count,
      old.delivered_bill_count,
      old.cancelled_bill_count
    ) then
      raise exception 'Approved reports are locked. Admin override required.' using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'submitted' and actor_role = 'driver' then
    if row(
      new.report_date,
      new.route_program_id,
      new.prepared_by,
      new.staff_name,
      new.territory_name_snapshot,
      new.route_name_snapshot,
      new.remarks,
      new.total_cash,
      new.total_cheques,
      new.total_credit,
      new.total_expenses,
      new.day_sale_total,
      new.total_sale,
      new.db_margin_percent,
      new.db_margin_value,
      new.net_profit,
      new.cash_in_hand,
      new.cash_in_bank,
      new.cash_book_total,
      new.cash_physical_total,
      new.cash_difference,
      new.total_bill_count,
      new.delivered_bill_count,
      new.cancelled_bill_count
    )
    is distinct from
    row(
      old.report_date,
      old.route_program_id,
      old.prepared_by,
      old.staff_name,
      old.territory_name_snapshot,
      old.route_name_snapshot,
      old.remarks,
      old.total_cash,
      old.total_cheques,
      old.total_credit,
      old.total_expenses,
      old.day_sale_total,
      old.total_sale,
      old.db_margin_percent,
      old.db_margin_value,
      old.net_profit,
      old.cash_in_hand,
      old.cash_in_bank,
      old.cash_book_total,
      old.cash_physical_total,
      old.cash_difference,
      old.total_bill_count,
      old.delivered_bill_count,
      old.cancelled_bill_count
    ) then
      raise exception 'Submitted reports cannot be edited by drivers unless reopened.' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'approved' and new.approved_at is null then
    raise exception 'Approved reports must record approved_at.' using errcode = '23514';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    raise exception 'Submitted reports must record submitted_at.' using errcode = '23514';
  end if;

  if new.status = 'rejected' and (new.rejected_at is null or nullif(trim(new.rejection_reason), '') is null) then
    raise exception 'Rejected reports must record rejected_at and rejection_reason.' using errcode = '23514';
  end if;

  if new.status = 'draft' then
    if new.approved_at is not null or new.rejected_at is not null then
      raise exception 'Draft reports cannot retain approval or rejection timestamps.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_daily_report_workflow_guard() is 'Prevents invalid status edits and locks submitted or approved reports according to role.';

-- ---------------------------------------------------------------------------
-- Workflow transition functions.
-- ---------------------------------------------------------------------------
create or replace function public.submit_daily_report(target_report_id uuid)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
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

  if current_report.status <> 'draft' then
    raise exception 'Only draft reports can be submitted.' using errcode = 'P0001';
  end if;

  if actor_role not in ('admin', 'supervisor') and current_report.prepared_by <> actor_id then
    raise exception 'Only the report owner, supervisor, or admin can submit this report.' using errcode = '42501';
  end if;

  update public.daily_reports
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    submitted_by = actor_id,
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

create or replace function public.reject_daily_report(target_report_id uuid, reason text)
returns public.daily_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_user_role();
  current_report public.daily_reports%rowtype;
  cleaned_reason text := nullif(trim(coalesce(reason, '')), '');
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if actor_role not in ('admin', 'supervisor') then
    raise exception 'Only supervisor or admin can reject reports.' using errcode = '42501';
  end if;

  if cleaned_reason is null then
    raise exception 'Rejection reason is required.' using errcode = '23514';
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
    raise exception 'Only submitted reports can be rejected.' using errcode = 'P0001';
  end if;

  update public.daily_reports
  set
    status = 'rejected',
    rejected_at = timezone('utc', now()),
    rejected_by = actor_id,
    rejection_reason = cleaned_reason,
    approved_at = null,
    approved_by = null
  where id = target_report_id
  returning * into current_report;

  return current_report;
end;
$$;

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

comment on function public.submit_daily_report(uuid) is 'Transitions a daily report from draft to submitted with actor tracking.';
comment on function public.approve_daily_report(uuid) is 'Transitions a submitted daily report to approved. Supervisor or admin only.';
comment on function public.reject_daily_report(uuid, text) is 'Transitions a submitted daily report to rejected with a required reason.';
comment on function public.reopen_daily_report(uuid) is 'Reopens submitted or rejected reports to draft; approved reports require admin override.';

-- ---------------------------------------------------------------------------
-- Bind workflow guard trigger.
-- ---------------------------------------------------------------------------
drop trigger if exists enforce_daily_report_workflow_guard on public.daily_reports;
create trigger enforce_daily_report_workflow_guard
before update on public.daily_reports
for each row execute procedure public.enforce_daily_report_workflow_guard();

commit;
