begin;

alter table public.daily_reports
  add column if not exists loading_completed_at timestamptz,
  add column if not exists loading_completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists loading_notes text;

alter table public.daily_reports
  drop constraint if exists daily_reports_loading_completion_check;

alter table public.daily_reports
  add constraint daily_reports_loading_completion_check check (
    (loading_completed_at is null and loading_completed_by is null)
    or (loading_completed_at is not null and loading_completed_by is not null)
  );

comment on column public.daily_reports.loading_completed_at is 'Timestamp when morning loading was finalized before route dispatch.';
comment on column public.daily_reports.loading_completed_by is 'User who finalized morning loading.';
comment on column public.daily_reports.loading_notes is 'Optional notes specific to the morning loading summary.';

create index if not exists daily_reports_loading_completed_at_idx
  on public.daily_reports (loading_completed_at desc)
  where deleted_at is null;

commit;
