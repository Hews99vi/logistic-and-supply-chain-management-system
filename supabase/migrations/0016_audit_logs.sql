begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action_type text not null check (action_type in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

comment on table public.audit_logs is 'Immutable audit trail for key operational and master-data tables.';
comment on column public.audit_logs.table_name is 'The audited table name.';
comment on column public.audit_logs.record_id is 'Primary key of the affected record.';
comment on column public.audit_logs.action_type is 'Database action type: INSERT, UPDATE, or DELETE.';
comment on column public.audit_logs.old_data is 'JSON snapshot of the row before the change.';
comment on column public.audit_logs.new_data is 'JSON snapshot of the row after the change.';
comment on column public.audit_logs.changed_by is 'Authenticated profile id when available from auth.uid().';
comment on column public.audit_logs.changed_at is 'UTC timestamp when the change was recorded.';

create index if not exists audit_logs_table_record_changed_at_idx
  on public.audit_logs (table_name, record_id, changed_at desc);

create index if not exists audit_logs_changed_at_idx
  on public.audit_logs (changed_at desc);

create index if not exists audit_logs_changed_by_idx
  on public.audit_logs (changed_by, changed_at desc)
  where changed_by is not null;

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_policy on public.audit_logs;
create policy audit_logs_select_policy
on public.audit_logs
for select
to authenticated
using (
  public.is_admin() or public.is_supervisor()
);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  before_data jsonb;
  after_data jsonb;
  normalized_before jsonb;
  normalized_after jsonb;
  target_record_id uuid;
begin
  if tg_op = 'INSERT' then
    after_data := to_jsonb(new);
    target_record_id := new.id;

    insert into public.audit_logs (
      table_name,
      record_id,
      action_type,
      old_data,
      new_data,
      changed_by,
      changed_at
    )
    values (
      tg_table_name,
      target_record_id,
      'INSERT',
      null,
      after_data,
      actor_id,
      timezone('utc', now())
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    before_data := to_jsonb(old);
    after_data := to_jsonb(new);
    normalized_before := before_data - 'updated_at';
    normalized_after := after_data - 'updated_at';
    target_record_id := new.id;

    if normalized_before = normalized_after then
      return new;
    end if;

    insert into public.audit_logs (
      table_name,
      record_id,
      action_type,
      old_data,
      new_data,
      changed_by,
      changed_at
    )
    values (
      tg_table_name,
      target_record_id,
      'UPDATE',
      before_data,
      after_data,
      actor_id,
      timezone('utc', now())
    );

    return new;
  end if;

  before_data := to_jsonb(old);
  target_record_id := old.id;

  insert into public.audit_logs (
    table_name,
    record_id,
    action_type,
    old_data,
    new_data,
    changed_by,
    changed_at
  )
  values (
    tg_table_name,
    target_record_id,
    'DELETE',
    before_data,
    null,
    actor_id,
    timezone('utc', now())
  );

  return old;
end;
$$;

comment on function public.write_audit_log() is 'Generic trigger function that writes INSERT, UPDATE, and DELETE row snapshots to audit_logs.';

create or replace function public.get_report_audit_history(target_report_id uuid)
returns table(
  id uuid,
  table_name text,
  record_id uuid,
  action_type text,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    al.id,
    al.table_name,
    al.record_id,
    al.action_type,
    al.old_data,
    al.new_data,
    al.changed_by,
    al.changed_at
  from public.audit_logs al
  where (
    al.table_name = 'daily_reports'
    and al.record_id = target_report_id
  )
  or (
    al.table_name in (
      'report_invoice_entries',
      'report_expenses',
      'report_cash_denominations',
      'report_inventory_entries',
      'report_return_damage_entries'
    )
    and (
      (al.new_data ->> 'daily_report_id')::uuid = target_report_id
      or (al.old_data ->> 'daily_report_id')::uuid = target_report_id
    )
  )
  order by al.changed_at desc, al.id desc;
$$;

comment on function public.get_report_audit_history(uuid) is 'Returns audit history for a report and all of its child records.';

grant execute on function public.get_report_audit_history(uuid) to authenticated;

drop trigger if exists audit_daily_reports on public.daily_reports;
create trigger audit_daily_reports
after insert or update or delete on public.daily_reports
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_invoice_entries on public.report_invoice_entries;
create trigger audit_report_invoice_entries
after insert or update or delete on public.report_invoice_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_expenses on public.report_expenses;
create trigger audit_report_expenses
after insert or update or delete on public.report_expenses
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_cash_denominations on public.report_cash_denominations;
create trigger audit_report_cash_denominations
after insert or update or delete on public.report_cash_denominations
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_inventory_entries on public.report_inventory_entries;
create trigger audit_report_inventory_entries
after insert or update or delete on public.report_inventory_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_report_return_damage_entries on public.report_return_damage_entries;
create trigger audit_report_return_damage_entries
after insert or update or delete on public.report_return_damage_entries
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_products on public.products;
create trigger audit_products
after insert or update or delete on public.products
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_route_programs on public.route_programs;
create trigger audit_route_programs
after insert or update or delete on public.route_programs
for each row execute procedure public.write_audit_log();

commit;