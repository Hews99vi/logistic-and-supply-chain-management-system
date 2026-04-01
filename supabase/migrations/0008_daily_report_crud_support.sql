begin;

alter table public.daily_reports
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete restrict;

comment on column public.daily_reports.deleted_at is 'Soft-delete timestamp. Deleted reports are excluded from normal read queries.';
comment on column public.daily_reports.deleted_by is 'User who soft-deleted the report.';

create index if not exists daily_reports_deleted_at_idx on public.daily_reports (deleted_at);
create index if not exists daily_reports_report_date_status_idx on public.daily_reports (report_date, status) where deleted_at is null;
create index if not exists daily_reports_route_status_idx on public.daily_reports (route_program_id, status) where deleted_at is null;
create index if not exists daily_reports_prepared_by_status_idx on public.daily_reports (prepared_by, status) where deleted_at is null;

commit;
