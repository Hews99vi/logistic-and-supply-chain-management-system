# Supabase Pilot Verification Checklist

Use this checklist in the target Supabase project before pilot use of:
- `Daily Loading Summary`
- `DATE End-of-Day Report`

Run the SQL checks below in the Supabase SQL editor.

## 1. Confirm Required Migration Files Exist In Repo

Expected migration chain through `0024`:

- `0001_initial_schema.sql`
- `0002_storage.sql`
- `0003_dairy_route_operations.sql`
- `0004_auth_role_management.sql`
- `0005_operational_rls_policies.sql`
- `0006_daily_report_calculation_logic.sql`
- `0007_daily_report_workflow.sql`
- `0008_daily_report_crud_support.sql`
- `0009_daily_report_soft_delete_rls.sql`
- `0010_report_invoice_entries_workflow_and_batch.sql`
- `0011_report_expenses_workflow_and_batch.sql`
- `0012_report_cash_denominations_defaults_and_batch.sql`
- `0013_report_inventory_entries_workflow_and_batch.sql`
- `0014_report_return_damage_entries_workflow_and_batch.sql`
- `0015_dashboard_reporting_functions.sql`
- `0016_audit_logs.sql`
- `0017_profiles_rls_recursion_fix.sql`
- `0018_memberships_rls_recursion_fix.sql`
- `0019_daily_loading_summary_lifecycle.sql`
- `0020_route_programs_organization_scope.sql`
- `0021_daily_report_submit_completeness.sql`
- `0022_product_structured_sku_fields.sql`
- `0023_product_structured_sku_backfill.sql`
- `0024_report_product_structured_snapshots.sql`

## 2. Verify Required Tables Exist

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'organization_memberships',
    'organizations',
    'products',
    'route_programs',
    'daily_reports',
    'report_inventory_entries',
    'report_invoice_entries',
    'report_expenses',
    'report_cash_denominations',
    'report_return_damage_entries'
  )
order by table_name;
```

Expected result:
- all listed tables are present

## 3. Verify Required `daily_reports` Columns

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'daily_reports'
  and column_name in (
    'report_date',
    'route_program_id',
    'prepared_by',
    'staff_name',
    'territory_name_snapshot',
    'route_name_snapshot',
    'status',
    'remarks',
    'total_cash',
    'total_cheques',
    'total_credit',
    'total_expenses',
    'day_sale_total',
    'total_sale',
    'db_margin_percent',
    'db_margin_value',
    'net_profit',
    'cash_in_hand',
    'cash_in_bank',
    'cash_book_total',
    'cash_physical_total',
    'cash_difference',
    'total_bill_count',
    'delivered_bill_count',
    'cancelled_bill_count',
    'loading_completed_at',
    'loading_completed_by',
    'loading_notes',
    'deleted_at',
    'deleted_by'
  )
order by column_name;
```

Expected result:
- all listed columns are present

## 4. Verify Report Snapshot Columns

### 4.1 Inventory snapshot columns

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'report_inventory_entries'
  and column_name in (
    'product_code_snapshot',
    'product_name_snapshot',
    'product_display_name_snapshot',
    'brand_snapshot',
    'product_family_snapshot',
    'variant_snapshot',
    'unit_size_snapshot',
    'unit_measure_snapshot',
    'pack_size_snapshot',
    'selling_unit_snapshot',
    'unit_price_snapshot'
  )
order by column_name;
```

Expected result:
- all listed columns are present

### 4.2 Return / damage snapshot columns

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'report_return_damage_entries'
  and column_name in (
    'product_code_snapshot',
    'product_name_snapshot',
    'product_display_name_snapshot',
    'brand_snapshot',
    'product_family_snapshot',
    'variant_snapshot',
    'unit_size_snapshot',
    'unit_measure_snapshot',
    'pack_size_snapshot',
    'selling_unit_snapshot',
    'unit_price_snapshot'
  )
order by column_name;
```

Expected result:
- all listed columns are present

## 5. Verify `route_programs.organization_id` Behavior

### 5.1 Confirm required columns

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'route_programs'
  and column_name in (
    'organization_id',
    'territory_name',
    'day_of_week',
    'frequency_label',
    'route_name',
    'route_description',
    'is_active'
  )
order by column_name;
```

Expected result:
- `organization_id` exists and is `NOT NULL`

### 5.2 Confirm organization-scoped uniqueness exists

```sql
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'route_programs'
  and conname = 'route_programs_business_key';
```

Expected result:
- unique constraint includes:
  - `organization_id`
  - `territory_name`
  - `day_of_week`
  - `route_name`

### 5.3 Confirm no null organization ids remain

```sql
select count(*) as null_organization_ids
from public.route_programs
where organization_id is null;
```

Expected result:
- `0`

## 6. Verify Required RPCs / Functions Exist

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'submit_daily_report',
    'approve_daily_report',
    'reject_daily_report',
    'reopen_daily_report',
    'save_report_invoice_entries',
    'save_report_expenses',
    'save_report_cash_denominations',
    'save_report_inventory_entries',
    'save_report_return_damage_entries',
    'current_user_organization_ids',
    'current_user_role',
    'is_admin',
    'is_supervisor',
    'has_active_profile',
    'parse_legacy_product_pack_pattern'
  )
order by routine_name;
```

Expected result:
- all listed routines are present

## 7. Verify The `submit_daily_report()` Definition Was Updated By `0021`

```sql
select pg_get_functiondef('public.submit_daily_report(uuid)'::regprocedure);
```

Confirm the function body includes checks for:
- at least one invoice entry
- populated total/delivered/cancel bill counts
- delivered + cancelled <= total
- positive denomination note counts when cash checking is expected

If those checks are missing, `0021_daily_report_submit_completeness.sql` has not been applied correctly.

## 8. Verify RLS / Policy Assumptions

### 8.1 Route-program policies

```sql
select policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'route_programs'
order by policyname;
```

Confirm the route-program policies reference:
- `organization_id = any(public.current_user_organization_ids())`
- `public.has_active_profile()` for select
- `public.is_admin()` / `public.is_supervisor()` for writes

### 8.2 Membership policies

```sql
select policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'organization_memberships'
order by policyname;
```

Confirm these policies exist:
- `organization_memberships_select_policy`
- `organization_memberships_insert_policy`
- `organization_memberships_update_policy`
- `organization_memberships_delete_policy`

This helps confirm the `0018_memberships_rls_recursion_fix.sql` state is present.

## 9. Verify Active Profile And Active Membership Data

Run these with a real pilot user id if needed.

### 9.1 Active profile row

```sql
select id, role, is_active
from public.profiles
where id = 'REPLACE_WITH_AUTH_USER_ID';
```

Expected result:
- one row exists
- `is_active = true`
- `role` is one of:
  - `admin`
  - `supervisor`
  - `driver`
  - `cashier`

### 9.2 Active organization membership row

```sql
select user_id, organization_id, status
from public.organization_memberships
where user_id = 'REPLACE_WITH_AUTH_USER_ID'
order by created_at desc;
```

Expected result:
- at least one row exists
- at least one membership has `status = 'ACTIVE'`

## 10. Verify Pilot Route And Product Seed Data Exists

### 10.1 Active route programs available

```sql
select id, organization_id, route_name, territory_name, is_active
from public.route_programs
where is_active = true
order by route_name;
```

Expected result:
- at least one active route program for the pilot organization

### 10.2 Active products available

```sql
select id, organization_id, product_code, product_name, display_name, product_family, unit_size, unit_measure, pack_size, selling_unit, is_active
from public.products
where is_active = true
order by coalesce(display_name, product_name)
limit 20;
```

Expected result:
- active structured products exist for the same organization used in the pilot
- `display_name` is populated for operator-facing reads where possible
- `pack_size` is populated for products that support unit-equivalent helpers

### 10.3 Backfill review view is available

```sql
select migration_status, count(*)
from public.product_structuring_backfill_review
group by migration_status
order by migration_status;
```

Expected result:
- the view runs without error
- rows needing manual cleanup remain visible for follow-up

### 10.4 Historical report snapshots are populated

```sql
select
  count(*) filter (where product_display_name_snapshot is not null) as display_name_rows,
  count(*) filter (where product_family_snapshot is not null) as family_rows,
  count(*) filter (where pack_size_snapshot is not null) as pack_rows
from public.report_inventory_entries;
```

```sql
select
  count(*) filter (where product_display_name_snapshot is not null) as display_name_rows,
  count(*) filter (where product_family_snapshot is not null) as family_rows,
  count(*) filter (where pack_size_snapshot is not null) as pack_rows
from public.report_return_damage_entries;
```

Expected result:
- these queries run without error
- existing linked report rows show populated structured snapshot values where source product data was available

### 10.5 Verify newly saved rows retain structured SKU snapshots

Run this after saving a fresh loading summary / DATE report that includes product rows.

```sql
select
  daily_report_id,
  product_id,
  product_code_snapshot,
  product_name_snapshot,
  product_display_name_snapshot,
  product_family_snapshot,
  unit_size_snapshot,
  unit_measure_snapshot,
  pack_size_snapshot,
  selling_unit_snapshot,
  created_at
from public.report_inventory_entries
where created_at >= now() - interval '7 days'
order by created_at desc
limit 20;
```

```sql
select
  daily_report_id,
  product_id,
  product_code_snapshot,
  product_name_snapshot,
  product_display_name_snapshot,
  product_family_snapshot,
  unit_size_snapshot,
  unit_measure_snapshot,
  pack_size_snapshot,
  selling_unit_snapshot,
  created_at
from public.report_return_damage_entries
where created_at >= now() - interval '7 days'
order by created_at desc
limit 20;
```

Expected result:
- newly created operational rows show both legacy snapshot fields and structured snapshot fields
- `product_display_name_snapshot` should normally be populated for new rows
- `product_family_snapshot` should normally be populated for new rows
- `pack_size_snapshot` should be populated when the source product has pack structure defined
- null structured snapshot values should only appear for legitimately legacy or partially structured product records

## 11. Verify Loading-Summary-Specific Lifecycle State

```sql
select id, report_date, route_program_id, loading_completed_at, loading_completed_by, loading_notes, deleted_at
from public.daily_reports
order by created_at desc
limit 20;
```

Expected result:
- loading lifecycle columns exist and return data without error

## 12. Optional Data Sanity Checks For Pilot

### 12.1 Confirm route-day uniqueness is active

```sql
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'daily_reports'
  and conname = 'daily_reports_unique_route_day';
```

Expected result:
- uniqueness exists on `(report_date, route_program_id)`

### 12.2 Confirm no obvious null route snapshots in existing reports

```sql
select count(*) as broken_snapshot_rows
from public.daily_reports
where territory_name_snapshot is null
   or route_name_snapshot is null;
```

Expected result:
- ideally `0`

## 13. Final Pilot Readiness Decision

Treat the target Supabase environment as ready for pilot only if all of the following are true:
- migrations are present through `0024`
- required tables and columns exist
- required functions, helpers, and RPCs exist
- route programs are organization-scoped
- active profile and active membership data exist for test users
- at least one active route program exists
- at least one active structured product exists
- report inventory and return/damage tables include the structured SKU snapshot columns
- browser print is acceptable for operational use during pilot

If any of the checks above fail, do not treat the environment as ready for the two core workflows.

