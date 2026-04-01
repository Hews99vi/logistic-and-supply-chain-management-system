begin;

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
  invoice_entry_count bigint := 0;
  positive_denomination_count bigint := 0;
  requires_cash_check boolean := false;
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

  select count(*)
  into invoice_entry_count
  from public.report_invoice_entries rie
  where rie.daily_report_id = target_report_id;

  if invoice_entry_count = 0 then
    raise exception 'Add at least one invoice entry before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count is null
     or current_report.delivered_bill_count is null
     or current_report.cancelled_bill_count is null then
    raise exception 'Total, delivered, and cancel bill counts must be provided before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.total_bill_count <= 0 then
    raise exception 'Total bill count must be greater than zero before submitting the DATE report.' using errcode = '23514';
  end if;

  if current_report.delivered_bill_count + current_report.cancelled_bill_count > current_report.total_bill_count then
    raise exception 'Delivered and cancel bill counts cannot exceed total bill count.' using errcode = '23514';
  end if;

  requires_cash_check :=
    current_report.total_cash > 0
    or current_report.cash_in_hand > 0
    or current_report.cash_physical_total > 0;

  if requires_cash_check then
    select count(*)
    into positive_denomination_count
    from public.report_cash_denominations rcd
    where rcd.daily_report_id = target_report_id
      and rcd.note_count > 0;

    if positive_denomination_count = 0 then
      raise exception 'Record denomination counts with at least one positive note count before submitting the DATE report.' using errcode = '23514';
    end if;
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

comment on function public.submit_daily_report(uuid) is 'Transitions a daily report from draft to submitted after validating DATE end-of-day completeness requirements.';

grant execute on function public.submit_daily_report(uuid) to authenticated;

commit;
