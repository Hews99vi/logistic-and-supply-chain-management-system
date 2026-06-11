# Dairy Distributor Operations System - Project Context

This document is the main handover note for this project. It explains the real business workflow, the system we are building, the codebase structure, the database model, important calculations, current implementation decisions, and the known operational pitfalls. It is written so both the owner/developer and a future AI assistant can quickly understand the project without rediscovering everything from scratch.

Last updated: 2026-06-11

## 1. Business Background

The client runs a dairy distribution agency. The mother company supplies dairy and related products to the distributor. The distributor loads products into lorries, distributes them to shops on assigned routes, collects cash/cheques/bills, and must hand over and reconcile everything correctly.

The mother company has its own system. At the end of the route/day, the distributor can export a file called `Flat Data.csv` from that mother-company system. That CSV is extremely important because it contains official sales, returns, invoice/payment-term, customer/outlet, route, and product data.

The client’s goal is to replace the manual paper workflow with this system while preserving how the business actually works:

1. Morning loading happens before the route starts.
2. The lorry leaves and sells/delivers products.
3. The mother-company rep updates the mother-company system during the route.
4. At the end of the day, the lorry returns.
5. The distributor uploads the mother-company Flat Data CSV.
6. The distributor physically counts leftover lorry stock.
7. The system compares loaded stock, sold stock, and returned stock.
8. Missing stock becomes driver accountability and possible salary deduction.
9. Cash, cheques, bills, expenses, and bank cash are reconciled.
10. The route-day handover is submitted and approved.

The business is currently one distributor organization, but the app is still organization-scoped to avoid accidental data leaks and to keep the design extensible.

## 2. Core Daily Workflow

The intended main user flow is:

```text
Loading Summary
  -> Finalize Morning Loading
  -> Upload Flat Data
  -> Count Returned Lorry Stock
  -> DATE Cash/Bills/Cheques
  -> Resolve Deductions
  -> Submit
  -> Approve
```

In the UI, the `Loading Summaries` area should be understood as the operational route-day workspace. The `Daily Reports`/`DATE` area is the financial and final submission workspace.

### 2.1 Morning Loading

Morning loading is where the distributor records what is put into the lorry before dispatch.

Main screen:

```text
/loading-summaries
/loading-summaries/[summaryId]
```

On the route-day sheet, products are entered in the `Route Product Movement Sheet`.

Important fields:

- `product_id`
- `loading_qty`
- `sales_qty`
- `balance_qty`
- `lorry_qty`
- `variance_qty`

During morning stage:

- Product structure can be edited.
- `loading_qty` can be edited.
- `sales_qty` and `lorry_qty` should remain zero.
- After finalizing, the morning loading structure is locked.

Finalizing loading deducts `loading_qty` from `main_inventory`.

### 2.2 Flat Data Upload

Flat Data is uploaded after morning loading is finalized.

Current upload location:

```text
/loading-summaries/[summaryId]
```

Look for the `Upload Flat Data` panel in the route-day sheet.

The upload parses the CSV in the browser using `papaparse`, validates products against the live product catalog, then calls:

```text
POST /api/reports/[reportId]/flat-data-import
```

The server-side import calls Supabase RPC:

```sql
public.import_flat_data_report(...)
```

Flat Data import fills:

- invoice entries
- cash/cheque/credit totals by invoice payment term
- product-level sales quantities
- product-level sales revenue
- costed sales quantity
- return/damage rows
- delivered bill count

Flat Data import must not change `loading_qty`.

If a sold product in Flat Data is not in the finalized loading sheet, import is blocked. This is intentional because the stock reconciliation depends on the morning load.

Example issue found:

- Flat Data contained product code `3026 - Ambewela FM 200mlx24`.
- Loading sheet had product code `3104 - Ambewela FM 200mlx24`.
- Names looked the same, but codes differed.
- Import blocked because the mother-company code `3026` was not in the loading sheet.
- Correct business source of truth is the mother-company Flat Data product code.

### 2.3 Returned Lorry Stock Count

After Flat Data import, the operator counts the physical stock remaining in the lorry and enters it as:

```text
lorry_qty
```

This mirrors the paper route sheet.

The system calculates expected balance:

```text
balance_qty = loading_qty - sales_qty
```

The system calculates variance:

```text
variance_qty = lorry_qty - balance_qty
```

Interpretation:

- `variance_qty = 0`: OK / matched
- `variance_qty > 0`: More stock than expected
- `variance_qty < 0`: Less stock / missing stock

Missing stock can become driver deduction.

### 2.4 DATE Cash / Bills / Cheques

The DATE end-of-day report is the financial close section.

Main route:

```text
/reports/[reportId]/date
```

This area should focus on:

- invoice totals
- cash denominations
- cash in hand
- bank cash
- cheques
- bill counts
- expenses
- final summary
- deductions
- submit

The DATE page should not be the primary place to enter stock movement. Stock movement belongs in the route-day sheet.

### 2.5 Driver Deductions

Missing stock is represented by negative variance:

```text
variance_qty < 0
```

Deduction candidates are generated into:

```sql
public.driver_deductions
```

Default deduction calculation:

```text
missing_qty = abs(variance_qty)
deduction_amount = missing_qty * unit_price_snapshot
```

Default deduction uses selling/system price unless the business later decides otherwise.

Deduction statuses:

- `pending`
- `approved`
- `waived`
- `settled`

Submitted reports must not have unresolved pending deductions.

### 2.6 Submit and Approve

Submit should block unless the route-day handover is complete:

- morning loading finalized
- Flat Data/manual sales entered
- lorry stock counted
- no invalid inventory quantities
- no unreviewed positive variance
- missing stock deductions approved or waived
- invoice/bill counts valid
- cash reconciliation balanced when cash exists

Approval returns `lorry_qty` to main inventory.

Reopening an approved report must safely reverse the lorry return and must not create negative stock unexpectedly.

## 3. Quantity Rules

This project standardizes all operational quantities to mother-company selling units.

This is one of the most important rules in the system.

### 3.1 Selling Units

All operational quantity fields are selling-unit counts:

- `main_inventory.quantity`
- `loading_qty`
- `sales_qty`
- `balance_qty`
- `lorry_qty`
- `variance_qty`
- return/damage/free issue quantities

Never multiply operational quantities by `pack_size`.

### 3.2 Pack Size

`pack_size` is packaging metadata only.

Example:

```text
Ambewela Yoghurt 80mlx48
unit_size = 80
unit_measure = ml
pack_size = 48
```

If the operator enters:

```text
loading_qty = 1440
```

That means:

```text
1440 selling units
```

It does not mean:

```text
1440 cases * 48
```

Optional display can show:

```text
1440 units (30 full packs)
```

But calculations always use `1440`.

### 3.3 Flat Data Proof

Flat Data product `016` has examples like:

```text
Qty = 48
valueafterDiscount = 3142.08
unit_price = 65.46
```

Calculation:

```text
48 * 65.46 = 3142.08
```

This proves `Qty` is selling units.

## 4. Product Pricing and Profit

Products have two important prices:

```text
products.unit_price
products.distributor_price
```

### 4.1 Selling/System Price

`unit_price` is the mother-company whole-seller/system selling price per selling unit.

This is visible to operational users who can view products.

### 4.2 Distributor Buying Price

`distributor_price` is the distributor’s buying/cost price from the mother company.

This is confidential and should be visible/editable only to users with cost permissions:

```text
products.view_costs
products.edit_costs
```

Missing distributor prices are stored as `0.00`. Admins should treat `0.00` on sold products as incomplete setup because profit will be overstated.

### 4.3 Gross Profit

Gross profit is based on actual product revenue and distributor cost:

```text
gross_profit_snapshot =
  sales_revenue_snapshot - (costed_sales_qty_snapshot * distributor_price_snapshot)
```

### 4.4 Net Profit

Net profit is:

```text
net_profit = sum(gross_profit_snapshot) - total_expenses
```

`db_margin_percent` and `db_margin_value` are legacy/reference fields. The main profit model should use distributor price snapshots.

### 4.5 Free Issues / Full Discounts

Flat Data rows with `valueafterDiscount = 0` still count as stock movement if quantity is positive.

They should:

- increase `sales_qty`
- have `sales_revenue_snapshot = 0`
- have `costed_sales_qty_snapshot = 0`
- not create negative distributor profit

## 5. Flat Data CSV Mapping

Flat Data columns used:

```text
ProductID
ProductName
Qty
Type
InvoiceId
OutletName
PaymentTerm
valueafterDiscount
dispct
Discount
Retunresoan
```

### 5.1 Product Validation

CSV `ProductID` is matched to `products.product_code`.

Leading zeroes are normalized:

```text
016 -> 16
047 -> 47
078 -> 78
```

Unknown products block import.

Products sold in CSV but missing from the finalized loading sheet also block import.

### 5.2 Invoice Aggregation

Rows where:

```text
Type = Invoice
```

are grouped by `InvoiceId`.

`valueafterDiscount` is summed per invoice and allocated by `PaymentTerm`:

- `Cash` -> `cash_amount`
- `Cheque` -> `cheque_amount`
- `Credit` -> `credit_amount`

### 5.3 Inventory Sales Aggregation

Invoice rows are grouped by ProductID.

For each product:

```text
sales_qty = sum(Qty)
sales_revenue_snapshot = sum(valueafterDiscount)
costed_sales_qty_snapshot = sum(Qty where valueafterDiscount > 0)
```

Rows with full discount/free issue:

```text
valueafterDiscount = 0
```

contribute to `sales_qty`, but not to `costed_sales_qty_snapshot`.

### 5.4 Returns and Damage

Rows where:

```text
Type = Return
```

are mapped to `report_return_damage_entries`.

Business rule:

```text
all return rows -> damage_qty
```

CSV return quantities are negative, so the system uses absolute value:

```text
damage_qty = abs(Qty)
```

Returns/damage are stock/accountability records. They do not directly reduce distributor profit.

## 6. Main Inventory

Main inventory is the distributor’s central stock before loading to lorries.

Main table:

```sql
public.main_inventory
```

Audit table:

```sql
public.inventory_transactions
```

Important transaction types include:

- `RECEIPT`
- `LOAD_OUT`
- `LORRY_RETURN`
- `LORRY_RETURN_REVERT`
- `ADJUSTMENT`

Morning loading finalize:

```text
main_inventory.quantity -= loading_qty
```

Report approval:

```text
main_inventory.quantity += lorry_qty
```

Approved report reopen:

```text
main_inventory.quantity -= previously returned lorry_qty
```

Negative stock should be prevented for normal business flows.

## 7. Roles and Permissions

Base roles:

- `admin`
- `supervisor`
- `driver`
- `cashier`

Permission model:

- default role permissions in `feature_permissions`
- per-user overrides in `user_feature_overrides`

Feature keys include:

- `dashboard`
- `daily_reports`
- `date_sheet`
- `loading_summaries`
- `main_inventory`
- `products`
- `route_programs`
- `customers`
- `users`
- `settings`
- `analytics`

Action keys include:

- `view`
- `create`
- `edit`
- `delete`
- `submit`
- `approve`
- `reopen`
- `import`
- `receive_stock`
- `view_costs`
- `edit_costs`

The helper that resolves permissions:

```text
lib/auth/permissions.ts
```

Protected page guard:

```text
lib/auth/page-guard.ts
```

Current important behavior:

- signed-out users should go to `/login`
- users without active profile/membership should be blocked
- sidebar should hide unauthorized features
- API/RPC should enforce the same permissions as UI

## 8. Codebase Structure

This is a Next.js 15 application with App Router, React 19, Supabase, Tailwind, Zod, and PapaParse.

### 8.1 Top-Level Areas

```text
app/          Next.js pages and API routes
features/     frontend feature modules
services/     server-side business/data services
lib/          shared helpers, auth, validation, Supabase clients
types/        domain and generated database types
supabase/     SQL migrations
components/   shared UI/layout components
docs/         supporting docs
```

### 8.2 App Routes

Important pages:

```text
/login
/dashboard
/loading-summaries
/loading-summaries/[summaryId]
/loading-summaries/[summaryId]/print
/reports
/reports/[reportId]
/reports/[reportId]/date
/main-inventory
/products
/route-programs
/customers
```

Important API routes:

```text
/api/auth/me
/api/loading-summaries
/api/loading-summaries/[summaryId]
/api/loading-summaries/[summaryId]/items
/api/loading-summaries/[summaryId]/finalize
/api/reports/[reportId]/flat-data-import
/api/reports/[reportId]/submit
/api/reports/[reportId]/approve
/api/reports/[reportId]/reopen
/api/main-inventory
/api/main-inventory/receive
/api/products
/api/route-programs
/api/customers
```

### 8.3 Loading Summary Feature

Frontend:

```text
features/loading-summaries/
```

Important files:

```text
components/loading-summaries-management-view.tsx
components/loading-summaries-table.tsx
components/loading-summary-workspace-view.tsx
components/loading-summary-items-panel.tsx
components/loading-summary-print-view.tsx
hooks/use-loading-summaries-management.ts
hooks/use-loading-summary-workspace.ts
api/loading-summaries-api.ts
types.ts
```

Server:

```text
services/loading-summaries/loading-summary.service.ts
services/loading-summaries/loading-summary-item.service.ts
```

Core RPCs:

```sql
public.create_loading_summary(...)
public.save_loading_summary_items(...)
public.finalize_loading_summary(...)
```

### 8.4 Reports / DATE Feature

Frontend:

```text
features/reports/
```

Important files:

```text
components/daily-report-workspace-view.tsx
components/date-end-of-day-report-view.tsx
components/flat-data-import-panel.tsx
components/report-inventory-entries-panel.tsx
components/report-invoice-entries-panel.tsx
components/report-return-damage-entries-panel.tsx
components/report-cash-audit-panel.tsx
components/report-driver-deductions-panel.tsx
components/report-final-summary-panel.tsx
utils/flatDataParser.ts
lib/report-submit-checklist.ts
api/daily-reports-api.ts
```

Server:

```text
services/reports/
```

Important services:

```text
daily-report.service.ts
flat-data-import.service.ts
report-inventory-entry.service.ts
report-invoice-entry.service.ts
report-return-damage-entry.service.ts
report-cash-denomination.service.ts
report-expense-entry.service.ts
driver-deduction.service.ts
dashboard-report.service.ts
```

Core RPCs:

```sql
public.import_flat_data_report(...)
public.submit_daily_report(...)
public.approve_daily_report(...)
public.reopen_daily_report(...)
public.recalculate_daily_report_totals(...)
public.sync_driver_deductions_for_report(...)
public.resolve_driver_deduction(...)
```

### 8.5 Product Feature

Frontend:

```text
features/products/
```

Server:

```text
services/products/product.service.ts
```

Important product fields:

```text
product_code
product_name
display_name
unit_price
base_price
distributor_price
brand
product_family
variant
unit_size
unit_measure
pack_size
selling_unit
quantity_entry_mode
is_active
```

### 8.6 Main Inventory Feature

Frontend:

```text
features/main-inventory/
```

Server:

```text
services/inventory/main-inventory.service.ts
```

Main RPC:

```sql
public.receive_main_inventory(...)
```

## 9. Database Migration Notes

The migrations have evolved heavily during development. This means a Supabase project may be in a partially upgraded state if a migration failed in the SQL editor. Many migrations are wrapped in `begin; ... commit;`, so failed runs usually roll back.

Important migrations:

```text
0001_initial_schema.sql
0003_dairy_route_operations.sql
0004_auth_role_management.sql
0006_daily_report_calculation_logic.sql
0007_daily_report_workflow.sql
0010_report_invoice_entries_workflow_and_batch.sql
0011_report_expenses_workflow_and_batch.sql
0012_report_cash_denominations_defaults_and_batch.sql
0013_report_inventory_entries_workflow_and_batch.sql
0014_report_return_damage_entries_workflow_and_batch.sql
0015_dashboard_reporting_functions.sql
0016_audit_logs.sql
0019_daily_loading_summary_lifecycle.sql
0024_report_product_structured_snapshots.sql
0025_product_quantity_entry_mode.sql
0026_main_inventory.sql
0027_dsd_inventory_standards.sql
0029_ambewela_product_price_seed.sql
0030_ambewela_route_program_seed.sql
0031_distributor_profit_tracking.sql
0032_temp_main_inventory_opening_stock_seed.sql
0033_enforce_cash_balanced_report_submit.sql
0034_prevent_negative_stock_on_loading_finalize.sql
0035_standardize_quantities_to_selling_units.sql
0036_business_workflow_hardening.sql
0037_fix_daily_report_rls.sql
0038_product_pricing_fields.sql
0039_allow_loading_summary_daily_report_insert.sql
0040_create_loading_summary_rpc.sql
0041_save_loading_summary_items_rpc.sql
```

### 9.1 Critical Migration Caveat

PostgreSQL cannot change a function return type with `create or replace function`.

This error was seen:

```text
cannot change return type of existing function
HINT: Use DROP FUNCTION recalculate_daily_report_totals(uuid) first.
```

The correct fix was not to drop blindly. The function must keep the existing return type:

```sql
returns void
```

Call it using:

```sql
perform public.recalculate_daily_report_totals(report_id);
```

Then select the report separately if needed.

### 9.2 Current Dedicated Loading Save RPC

Because loading summary saves should be independent from broad DATE inventory logic, a dedicated RPC was added:

```text
supabase/migrations/0041_save_loading_summary_items_rpc.sql
```

Function:

```sql
public.save_loading_summary_items(target_daily_report_id uuid, input_entries jsonb)
```

Behavior:

- morning stage can add/remove/change product rows and loading quantities
- after finalize, product structure and loading quantities are locked
- after finalize, only sales and lorry quantities can change
- all quantities are selling units

The API service calls this first and falls back to older `save_report_inventory_entries` only if the new RPC does not exist.

## 10. Important Calculations

### 10.1 Stock Calculations

```text
balance_qty = loading_qty - sales_qty
variance_qty = lorry_qty - balance_qty
```

Equivalent:

```text
variance_qty = lorry_qty - (loading_qty - sales_qty)
```

### 10.2 Loaded Value

```text
loaded_value = loading_qty * unit_price_snapshot
```

### 10.3 Sales Revenue Fallback

When manual entry has no CSV revenue:

```text
sales_revenue_snapshot = sales_qty * unit_price_snapshot
```

When imported from Flat Data:

```text
sales_revenue_snapshot = sum(valueafterDiscount)
```

### 10.4 Profit

```text
gross_profit_snapshot =
  sales_revenue_snapshot - (costed_sales_qty_snapshot * distributor_price_snapshot)
```

```text
net_profit = sum(gross_profit_snapshot) - total_expenses
```

### 10.5 Cash Book and Cash Difference

Cash book total:

```text
cash_book_total = cash_in_hand + cash_in_bank
```

Cash difference:

```text
cash_difference = cash_physical_total - cash_book_total
```

Submit should block when cash exists and cash difference is not balanced.

### 10.6 Driver Deduction

```text
missing_qty = abs(variance_qty) where variance_qty < 0
deduction_amount = missing_qty * unit_price_snapshot
```

## 11. Known Product Master Data Details

Product codes are critical. The mother-company Flat Data code is the source of truth.

Known issue:

```text
3026 - Ambewela FM 200mlx24
3104 - Ambewela FM 200mlx24
```

These look like the same product by name, but the CSV may use `3026` while a loading sheet may accidentally use `3104`.

If the loading sheet is finalized with `3104` but Flat Data sells `3026`, import blocks.

Correct business approach:

- Use the mother-company Flat Data product code in loading.
- Consider making aliases/duplicate warnings for same product names if product master data keeps both codes.
- Do not silently map `3104` to `3026` unless the business confirms they are truly interchangeable.

## 12. Authentication and Access

The app uses Supabase Auth.

Important files:

```text
middleware.ts
lib/auth/helpers.ts
lib/auth/page-guard.ts
lib/auth/permissions.ts
features/auth/api/session-cache.ts
features/auth/components/login-form.tsx
app/api/auth/me/route.ts
```

Expected behavior:

- signed-out users should be redirected to `/login`
- `/login` should be accessible directly
- protected pages should require active profile and organization membership
- API calls should return `401` if signed out
- API calls should return `403` if signed in but not permitted

Earlier issue:

The app previously allowed access to dashboard-like screens without the login flow being obvious. Page guards and middleware were tightened to redirect unauthenticated users.

## 13. UI/UX Decisions

The app should feel like an operational tool, not a marketing site.

Primary business navigation:

- Dashboard
- Daily Reports
- Loading Summaries
- Main Inventory
- Products
- Route Programs
- Customers
- Analytics/Users/Settings later

Important UI decision:

The route-day sheet should mirror the paper stock sheet:

```text
Product Code
Product Name
Loading Qty
Sales Qty
Expected Balance
Counted Lorry Qty
More
Less
Status / Action
```

Avoid hiding Flat Data import under a generic report overview. It should be reachable from the loading summary route-day sheet after morning loading is finalized.

## 14. Current Known Issues / Watch Items

### 14.1 Product Code Mismatches

If Flat Data import blocks with:

```text
Flat Data includes product <uuid> that is not in the loading sheet.
```

Find the product:

```sql
select id, product_code, product_name
from public.products
where id = '<uuid>';
```

Then compare against route sheet rows:

```sql
select product_code_snapshot, product_name_snapshot, loading_qty
from public.report_inventory_entries
where daily_report_id = '<report-id>'
order by product_code_snapshot;
```

Most likely cause: wrong product code was selected during morning loading.

### 14.2 Finalized Loading Corrections

Once loading is finalized, product rows are locked because stock was already deducted.

If a wrong product code was used, correction must adjust:

- `report_inventory_entries`
- product snapshot fields
- `main_inventory`
- `inventory_transactions` audit log

Do not simply edit the row without correcting main inventory.

### 14.3 SQL Migration Drift

Because migrations were created iteratively, Supabase may differ from local code. Always verify functions before assuming behavior:

```sql
select proname, pg_get_function_result(oid)
from pg_proc
where proname in (
  'recalculate_daily_report_totals',
  'save_loading_summary_items',
  'save_report_inventory_entries',
  'import_flat_data_report'
);
```

### 14.4 Development Artifacts

The repo currently contains local/test artifacts such as:

```text
Flat Data.csv
Flat Data (2).csv
Flat Data.xls
product prices.pdf
test_supabase*.js
tsconfig.tsbuildinfo
```

Some may be useful for testing, but they should be reviewed before committing or deploying.

## 15. Commands

Development:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Recommended verification order after frontend/type changes:

```bash
npm run typecheck
npm run build
```

If `.next` type artifacts become stale:

```bash
rm -rf .next
npm run typecheck
npm run build
```

## 16. Environment

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser/client code.

Supabase clients:

```text
lib/supabase/browser.ts  client/browser anon client
lib/supabase/server.ts   SSR cookie-aware anon client
lib/supabase/admin.ts    service-role admin client
```

## 17. Future Improvement Ideas

High-value next steps:

1. Add an admin correction screen for finalized loading product-code mistakes.
2. Add duplicate/similar product-code warnings in product selection.
3. Add product alias support if the mother company uses alternate codes.
4. Make Flat Data import error messages show product code/name, not only UUID.
5. Add an import pre-check that lists:
   - sold products in CSV
   - loaded products in route sheet
   - missing loaded products
   - extra loaded products
6. Add a route-day workflow dashboard:
   - morning loading pending
   - awaiting Flat Data
   - awaiting lorry count
   - deductions pending
   - ready to submit
7. Add driver salary/payroll view for approved deductions.
8. Add cheque detail management if Flat Data only gives cheque totals.
9. Add stronger automated tests for:
   - quantity unit calculations
   - Flat Data import
   - stock deduction/return
   - profit calculations
   - permissions

## 18. Mental Model for Future Development

When changing this project, keep these principles:

1. Mother-company Flat Data is the sales source of truth.
2. Product code must match the mother-company code.
3. All quantities are selling units.
4. Pack size is display metadata only.
5. Loading summary is the route-day stock sheet.
6. DATE is financial handover and final submission.
7. Finalizing loading affects main inventory, so locked rows are intentional.
8. Approval returns leftover lorry stock to main inventory.
9. Distributor profit uses distributor price snapshots, not only margin percent.
10. Returns/damage/free issues are accountability records, not direct profit reducers.
11. UI and API permissions must match.
12. Do not bypass RLS/security-definer logic without understanding stock/audit side effects.

