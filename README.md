# Dairy Distribution Operations System

Next.js App Router + TypeScript + Supabase operations system for route-based dairy distribution.

The current pilot deployment scope is centered on two business workflows:
- `Daily Loading Summary` before lorry dispatch
- `DATE End-of-Day Report` after route completion

This document covers the real deployment requirements for those two workflows.

## Product And Quantity Model

Products are now modeled as structured sellable SKUs, not just free-form product names.

Operationally important product fields now include:
- `product_code`
- `brand`
- `product_family`
- `variant`
- `unit_size`
- `unit_measure`
- `pack_size`
- `selling_unit`
- `display_name`
- `product_name`

Important behavior:
- `display_name` is the preferred UI and operational label.
- `product_name` is still preserved for backward compatibility during the transition.
- `category` is now optional and secondary. It can still be used for filtering, but SKU structure should carry the real product meaning.
- quantity in loading, inventory, and return/damage workflows means `pack/case quantity`, not loose inner units.
- unit-equivalent helpers are shown only when a product has a structured `pack_size`.

## Pilot Deployment Scope

Primary operational modules in scope for pilot use:
- `Daily Loading Summary`
- `DATE End-of-Day Report`
- `Daily Reports` workflow and child sections that support DATE closing
- `Route Programs`
- `Products`

Out of scope for pilot readiness:
- `Analytics`
- `Users`
- `Settings`
- any unfinished or placeholder module surface

## Required Environment Variables

The app currently depends on these variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Where they are used:
- `NEXT_PUBLIC_SUPABASE_URL`
  - browser Supabase client
  - server Supabase client
  - auth middleware bootstrap
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - browser Supabase client
  - server Supabase client
  - auth middleware bootstrap
- `SUPABASE_SERVICE_ROLE_KEY`
  - admin Supabase client
  - server-side create flows that intentionally avoid brittle insert-time RLS failures
  - currently required by direct daily report creation

If either public Supabase variable is missing:
- protected pages and API auth bootstrapping in `middleware.ts` will fail
- session-aware SSR behavior will not work correctly

If the service role key is missing:
- code paths using `createSupabaseAdminClient()` will fail at runtime
- direct daily report creation will fail

## Required Migration Chain

Apply all SQL migrations in order through:

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

## Critical Migrations For Core Workflows

- `0003_dairy_route_operations.sql`
  - creates `route_programs`, `daily_reports`, and the child report tables
  - creates the unique route-day constraint on `(report_date, route_program_id)`
  - without it, neither Loading Summary nor DATE can run

- `0006_daily_report_calculation_logic.sql`
  - keeps backend-calculated totals in sync
  - required for DATE financial summary correctness

- `0007_daily_report_workflow.sql`
  - provides workflow RPCs for submit, approve, reject, and reopen

- `0008_daily_report_crud_support.sql`
- `0009_daily_report_soft_delete_rls.sql`
  - required for `deleted_at` / `deleted_by` support and soft-delete-safe reads

- `0010` through `0014`
  - required for child-section batch save flows:
    - invoice entries
    - expense entries
    - cash denominations
    - inventory entries
    - return/damage entries

- `0017_profiles_rls_recursion_fix.sql`
- `0018_memberships_rls_recursion_fix.sql`
  - required to avoid recursive RLS failures around profile and membership access

- `0019_daily_loading_summary_lifecycle.sql`
  - adds loading-summary lifecycle fields:
    - `daily_reports.loading_completed_at`
    - `daily_reports.loading_completed_by`
    - `daily_reports.loading_notes`

- `0020_route_programs_organization_scope.sql`
  - adds `route_programs.organization_id`
  - makes route-program access and uniqueness explicitly organization-scoped
  - current loading-summary and report-create paths expect this behavior

- `0021_daily_report_submit_completeness.sql`
  - tightens `submit_daily_report()` so incomplete DATE reports cannot be submitted
  - required for the current DATE workflow behavior

- `0022_product_structured_sku_fields.sql`
  - adds structured SKU fields to `products`
  - makes `category` optional in the schema
  - preserves `product_name` for compatibility

- `0023_product_structured_sku_backfill.sql`
  - backfills structured SKU fields conservatively for legacy products
  - adds the `product_structuring_backfill_review` view for manual cleanup

- `0024_report_product_structured_snapshots.sql`
  - adds structured SKU snapshot fields to report inventory and return/damage rows
  - preserves historical product meaning even if the live product changes later

## Required Supabase Tables And Columns

The live Supabase schema must include at minimum:

### Products
- `products.product_code`
- `products.product_name`
- `products.display_name`
- `products.brand`
- `products.product_family`
- `products.variant`
- `products.unit_size`
- `products.unit_measure`
- `products.pack_size`
- `products.selling_unit`
- `products.unit_price`
- `products.category`
- `products.is_active`

### Route programs
- `route_programs.id`
- `route_programs.organization_id`
- `route_programs.territory_name`
- `route_programs.day_of_week`
- `route_programs.frequency_label`
- `route_programs.route_name`
- `route_programs.route_description`
- `route_programs.is_active`

### Daily reports
- `daily_reports.id`
- `daily_reports.report_date`
- `daily_reports.route_program_id`
- `daily_reports.prepared_by`
- `daily_reports.staff_name`
- `daily_reports.territory_name_snapshot`
- `daily_reports.route_name_snapshot`
- `daily_reports.status`
- `daily_reports.remarks`
- `daily_reports.total_cash`
- `daily_reports.total_cheques`
- `daily_reports.total_credit`
- `daily_reports.total_expenses`
- `daily_reports.day_sale_total`
- `daily_reports.total_sale`
- `daily_reports.db_margin_percent`
- `daily_reports.db_margin_value`
- `daily_reports.net_profit`
- `daily_reports.cash_in_hand`
- `daily_reports.cash_in_bank`
- `daily_reports.cash_book_total`
- `daily_reports.cash_physical_total`
- `daily_reports.cash_difference`
- `daily_reports.total_bill_count`
- `daily_reports.delivered_bill_count`
- `daily_reports.cancelled_bill_count`
- `daily_reports.loading_completed_at`
- `daily_reports.loading_completed_by`
- `daily_reports.loading_notes`
- `daily_reports.deleted_at`
- `daily_reports.deleted_by`

### Child report tables
- `report_inventory_entries`
  - includes legacy snapshots plus structured SKU snapshot fields such as `product_display_name_snapshot`, `product_family_snapshot`, `unit_size_snapshot`, `unit_measure_snapshot`, `pack_size_snapshot`, and `selling_unit_snapshot`
- `report_invoice_entries`
- `report_expenses`
- `report_cash_denominations`
- `report_return_damage_entries`
  - includes legacy snapshots plus structured SKU snapshot fields such as `product_display_name_snapshot`, `product_family_snapshot`, `unit_size_snapshot`, `unit_measure_snapshot`, `pack_size_snapshot`, and `selling_unit_snapshot`

## Required Supabase RPCs / Functions

The following database functions must exist and be executable by authenticated users where appropriate:

### Workflow RPCs
- `submit_daily_report(uuid)`
- `approve_daily_report(uuid)`
- `reject_daily_report(uuid, text)`
- `reopen_daily_report(uuid)`

### Batch-save RPCs
- `save_report_invoice_entries(uuid, jsonb)`
- `save_report_expenses(uuid, jsonb)`
- `save_report_cash_denominations(uuid, jsonb)`
- `save_report_inventory_entries(uuid, jsonb)`
- `save_report_return_damage_entries(uuid, jsonb)`

### Product migration helpers
- `parse_legacy_product_pack_pattern(text)`
- `product_structuring_backfill_review`

### Auth / policy helpers
- `current_user_organization_ids()`
- `current_user_role()`
- `is_admin()`
- `is_supervisor()`
- `has_active_profile()`

## Organization Scoping Expectations

The current system assumes route-day operations are organization-scoped.

Required live behavior:
- users have active `organization_memberships`
- route programs are readable only within the user�s organization scope
- route program uniqueness is organization-scoped
- the legacy direct report create path and the loading-summary-first path both rely on organization-scoped route selection

If `route_programs.organization_id` or its policies are missing:
- route selection can drift across tenants
- report and loading-summary creation behavior will not match the current service layer

## Supabase SQL Verification Checklist

For a hands-on SQL editor checklist, see:
- [docs/supabase-pilot-verification-checklist.md](docs/supabase-pilot-verification-checklist.md)

## Deployment Verification Checklist

Before pilot use, verify all of the following in the target Supabase environment:

1. Environment variables are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Migrations are applied through `0024_report_product_structured_snapshots.sql`

3. `route_programs` contains `organization_id` and active rows for the pilot organization

4. `daily_reports` contains:
   - loading lifecycle fields
   - soft-delete fields

5. `products` contains structured SKU fields and active rows usable by operations:
   - `display_name`
   - `product_family`
   - `unit_size`
   - `unit_measure`
   - `pack_size`
   - `selling_unit`

6. Report product snapshot columns exist on the operational report tables:
   - `report_inventory_entries.product_display_name_snapshot`
   - `report_inventory_entries.product_family_snapshot`
   - `report_inventory_entries.unit_size_snapshot`
   - `report_inventory_entries.unit_measure_snapshot`
   - `report_inventory_entries.pack_size_snapshot`
   - `report_inventory_entries.selling_unit_snapshot`
   - `report_return_damage_entries.product_display_name_snapshot`
   - `report_return_damage_entries.product_family_snapshot`
   - `report_return_damage_entries.unit_size_snapshot`
   - `report_return_damage_entries.unit_measure_snapshot`
   - `report_return_damage_entries.pack_size_snapshot`
   - `report_return_damage_entries.selling_unit_snapshot`

7. These RPCs exist and are callable:
   - `submit_daily_report`
   - `approve_daily_report`
   - `reject_daily_report`
   - `reopen_daily_report`
   - all `save_report_*` batch-save functions used by child sections

8. Auth and membership checks work with a real user:
   - active `profiles` row exists
   - active `organization_memberships` row exists
   - role is one of the expected app roles

9. Route-program organization scoping works:
   - users can only access route programs inside their organization

10. Browser print is acceptable for pilot operations:
   - Loading Summary print
   - DATE print

## Operational Pilot Smoke Test

For a step-by-step operator/tester checklist, see:
- [docs/operational-pilot-smoke-test.md](docs/operational-pilot-smoke-test.md)

## Real-World Smoke Test Checklist

### Daily Loading Summary
1. Sign in with an active user who has an active organization membership.
2. Open `/loading-summaries`.
3. Create a loading summary for a real route and date.
4. Confirm creation redirects to `/loading-summaries/[summaryId]`.
5. Add at least one product line.
6. Confirm the product picker shows structured `display_name` labels when available.
7. Confirm line items show pack information clearly enough to distinguish sellable SKUs.
8. Save and reload the page.
9. Confirm product rows persist.
10. Try to finalize with no valid loading pack/case quantity in a negative test case and confirm the backend rejects it.
11. Finalize a valid loading summary.
12. Confirm edit locking after finalize.
13. Open the print view and confirm browser print is readable.
14. Confirm the UI offers navigation into the DATE/report flow.

### DATE End-of-Day Report
1. Open the DATE page for the same route-day.
2. Add at least one invoice entry.
3. Add at least one expense if applicable.
4. Enter denomination counts if cash handling is part of the report.
5. If inventory or return/damage rows are used operationally, confirm quantities are understood as pack/case counts.
6. Fill bill counts:
   - total bill
   - delivered bill
   - cancel bill
7. Save the DATE form.
8. Try to submit an incomplete report in a negative test case and confirm the backend rejects it.
9. Submit a complete report.
10. Confirm status changes to `submitted`.
11. Confirm summary values reflect backend truth.
12. Open browser print and confirm the DATE sheet is operationally usable.

## Notes On Current Operational UX

- `Daily Loading Summary` is now the primary entrypoint for the route-day workflow.
- `/reports/new` still exists, but it should be treated as a secondary/fallback entry path.
- Products are managed as structured sellable SKUs. `display_name` should be treated as the primary operator-facing label.
- `product_name` is retained only for transition compatibility and legacy snapshot reads.
- quantity in operational product workflows means pack/case quantity.
- Legacy summary-panel fake `Share` / `Download PDF` actions have been removed.
- The real operational print path is browser print from the DATE page and the loading-summary print view.

## Example Environment

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
