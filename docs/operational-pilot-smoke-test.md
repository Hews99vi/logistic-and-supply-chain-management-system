# Operational Pilot Smoke-Test Checklist

Use this document for real pilot testing of the route-day workflow after the structured SKU and historical snapshot refactor.

This checklist verifies two things together:
- operators can clearly work with structured sellable SKUs in the UI
- historical route-day records preserve that SKU meaning after save and reload

Primary workflow surfaces covered:
- `Daily Loading Summary`
- `DATE End-of-Day Report`
- report inventory rows
- report return / damage rows

## Test Roles Required

Prepare at least these users in the pilot organization:
- one `admin` or `supervisor`
- one `driver`

Both users must have:
- an active `profiles` row
- an active `organization_memberships` row

## Test Data Required

Before running the checklist, confirm the pilot organization has:
- at least one active `route_programs` row
- at least one active structured `products` row with:
  - `display_name`
  - `product_family`
  - `unit_size`
  - `unit_measure`
  - `pack_size`
  - `selling_unit`
- at least one older or partially structured product if legacy fallback testing is possible
- access to browser print from the pilot workstation

---

## A. Structured SKU Loading Flow

### A1. Create a loading summary
1. Sign in as `admin` or `supervisor`.
   - Expected outcome: login succeeds and protected pages load.
   - Pass: user reaches the app shell without auth error.
   - Fail: auth loop, permissions error, or blank protected page.

2. Open `/loading-summaries`.
   - Expected outcome: list page loads with filters, table, and create action.
   - Pass: page loads without data or permission errors.
   - Fail: route not found, API error, or unauthorized response.

3. Click `Create New Loading Summary`.
   - Expected outcome: create flow opens and route options load.
   - Pass: create action is accessible and route selection is usable.
   - Fail: dialog or page does not open, or route options fail to load.

4. Create a loading summary using a real route and today’s date.
   - Expected outcome: creation succeeds and redirects to `/loading-summaries/[summaryId]`.
   - Pass: user lands on the loading summary detail page.
   - Fail: create error, no redirect, or wrong page opened.

### A2. Verify structured SKU presentation in loading rows
5. Add at least two product lines using structured products.
   - Expected outcome: the product selector shows operator-friendly structured SKU labels.
   - Pass: product options are distinguishable by `display_name`, pack information, or both.
   - Fail: picker depends only on ambiguous raw product name text.

6. For each added row, verify the line item shows:
   - product code
   - display name
   - unit size and measure when available
   - pack size when available
   - rate when shown in the current UI
   - Expected outcome: operators can identify the sellable pack without decoding legacy text.
   - Pass: SKU meaning is clear from the row itself.
   - Fail: row identity still depends mainly on legacy `product_name`.

7. Enter loading quantities for the rows.
   - Expected outcome: the quantity field/column is understood as `pack/case quantity`.
   - Pass: label, helper text, or surrounding wording makes the pack/case meaning clear.
   - Fail: quantity wording is generic enough to be confused with loose units.

8. If a row has `pack_size`, verify any unit-equivalent hint.
   - Expected outcome: the UI shows a secondary helper such as pack quantity multiplied by pack size.
   - Pass: helper appears only where it can be derived safely.
   - Fail: helper is missing for clearly structured rows, or fake values appear for legacy rows.

9. Save the loading rows and reload the page.
   - Expected outcome: rows persist with the same structured SKU presentation.
   - Pass: saved rows reload with correct product identity and pack-aware quantity meaning.
   - Fail: saved rows lose structured display context or reload incorrectly.

### A3. Finalize and print loading summary
10. Finalize the loading summary.
   - Expected outcome: finalize succeeds for a valid sheet.
   - Pass: loading is marked complete and editing becomes locked.
   - Fail: finalize fails for a valid structured loading sheet.

11. Open the loading print view.
   - Expected outcome: browser print shows the same structured SKU understanding.
   - Pass: print output includes clear product code, display name, and pack-aware quantity meaning.
   - Fail: print output falls back to ambiguous raw names or generic quantity wording.

---

## B. DATE Product Rows And Historical Snapshot Flow

### B1. Inventory rows
1. Open the DATE page for the same route-day.
   - Expected outcome: route/date continuity is preserved.
   - Pass: DATE opens on the same operational record.
   - Fail: wrong route-day opens or duplicate route-day behavior appears.

2. Add or update inventory rows for at least two structured products.
   - Expected outcome: each row clearly identifies the sellable SKU.
   - Pass: inventory rows show structured display name and pack details where available.
   - Fail: inventory rows still depend mainly on raw `product_name`.

3. Verify quantity wording for inventory fields such as loaded, sold, lorry, balance, or variance.
   - Expected outcome: quantity is clearly understood as `pack/case quantity`.
   - Pass: wording is explicit and consistent.
   - Fail: operators could reasonably mistake the numbers for loose units.

4. Save the DATE report and reload the page.
   - Expected outcome: saved inventory rows retain structured SKU identity after reload.
   - Pass: display name and pack information remain visible on the saved rows.
   - Fail: saved rows lose structured meaning after persistence.

### B2. Return / damage rows
5. Add at least one return/damage row for a structured product.
   - Expected outcome: the row shows structured product identity and pack-aware quantity meaning.
   - Pass: product code or display name plus pack information make the SKU clear.
   - Fail: row meaning depends mainly on legacy text.

6. Enter return, damage, or free issue quantities.
   - Expected outcome: quantities are clearly understood as `pack/case quantity`.
   - Pass: labels and helpers keep the same meaning as loading and inventory screens.
   - Fail: quantity semantics differ from the rest of the workflow.

7. Save and reload the DATE page.
   - Expected outcome: return/damage rows retain the same structured SKU identity after persistence.
   - Pass: saved rows reload with clear display name and pack details.
   - Fail: saved rows reload with only ambiguous legacy text.

### B3. Historical snapshot verification in app behavior
8. After save and reload, confirm that product-related rows still render correctly even if the live product list is not freshly reselected in the UI.
   - Expected outcome: report rows remain readable from stored snapshot data.
   - Pass: saved rows still show meaningful structured SKU context after reload.
   - Fail: row meaning disappears unless the live product lookup fills it back in.

9. If operationally possible in the pilot environment, temporarily inspect an older route-day or a row linked to a product that has changed since creation.
   - Expected outcome: historical rows preserve their original snapshot meaning.
   - Pass: old route-day rows still show the saved product identity rather than drifting to a newer meaning.
   - Fail: historical rows appear to depend on current product master data instead of stored snapshots.

---

## C. Legacy And Fallback Checks

### C1. Legacy product fallback
1. If a legacy or partially structured product exists, add it to loading, inventory, or return/damage flow.
   - Expected outcome: the UI remains usable without corrupting meaning.
   - Pass: the row still renders safely using fallback display text.
   - Fail: broken row rendering, blank product label, or fake structured values.

2. For the same legacy row, confirm no fake unit-equivalent helper appears unless `pack_size` is actually known.
   - Expected outcome: the system avoids invented calculations.
   - Pass: helper is omitted when pack structure cannot be derived safely.
   - Fail: the UI shows a misleading unit-equivalent for an ambiguous legacy row.

3. Save and reload the legacy row scenario.
   - Expected outcome: legacy-compatible fallback still works after persistence.
   - Pass: row remains readable and operationally safe.
   - Fail: row becomes less readable or loses identity after save.

### C2. Negative business checks
4. Try to finalize a loading summary with no valid positive loading quantity.
   - Expected outcome: backend rejects finalization.
   - Pass: summary remains draft and a business error is shown.
   - Fail: invalid loading sheet finalizes.

5. Try to submit an incomplete DATE report.
   - Expected outcome: checklist and backend protections prevent submit.
   - Pass: report remains draft.
   - Fail: incomplete DATE report submits.

---

## D. Driver And Ownership Checks

1. Sign in as `driver`.
   - Expected outcome: login succeeds and allowed modules load.
   - Pass: driver reaches the app shell.
   - Fail: auth or role failure.

2. Create and save a driver-owned loading summary with structured product rows.
   - Expected outcome: driver can perform allowed route-day work with the same SKU clarity.
   - Pass: driver sees structured SKU labels and pack-aware quantity wording.
   - Fail: driver flow loses clarity or permissions behave unexpectedly.

3. If test data is available, attempt to act on another user’s draft route-day.
   - Expected outcome: ownership restrictions still hold.
   - Pass: action is hidden, blocked, or rejected safely.
   - Fail: driver can improperly act on another user’s operational record.

---

## E. Print Verification

### E1. Loading summary print
1. Open the loading summary print path.
   - Expected outcome: printable page renders without action clutter.
   - Pass: route-day header, product identifiers, and pack-aware quantities are visible.
   - Fail: print layout is broken or product meaning is ambiguous.

2. Open browser print preview.
   - Expected outcome: content fits a usable paper layout.
   - Pass: operator can reasonably print the loading sheet for real work.
   - Fail: unreadable layout, clipped rows, or missing core product details.

### E2. DATE print / report surfaces
3. Open the DATE page print path if available in the current workflow.
   - Expected outcome: browser print remains operationally usable.
   - Pass: key route-day data is readable.
   - Fail: broken print behavior or missing critical content.

4. Where product rows appear in print or report surfaces, verify saved rows remain readable with structured SKU context.
   - Expected outcome: print/report output does not depend on decoding raw product names alone.
   - Pass: display name and pack-aware meaning are preserved or safely fallen back.
   - Fail: printed product rows lose meaningful identity.

---

## Final Pass / Fail Summary

Mark the smoke test as `PASS` only if all of the following are true:
- loading summary rows show structured SKU meaning clearly enough for real operations
- quantity is consistently understood as `pack/case quantity`
- inventory and return/damage rows retain structured SKU meaning after save and reload
- historical route-day rows remain readable from stored snapshot data
- legacy or partially structured rows fall back safely without fake calculations
- driver/admin ownership and workflow protections still behave correctly
- print/report surfaces remain operationally usable

Mark the smoke test as `FAIL` if any of these occur:
- operators must decode raw `product_name` text to understand the SKU
- quantity wording is ambiguous or conflicts across modules
- saved inventory or return/damage rows lose structured SKU meaning after reload
- historical rows appear to depend only on current product master data
- legacy rows render broken or show invented unit-equivalent values
- invalid loading or incomplete DATE workflows can still finalize or submit
- print/report output is not usable for real operations
