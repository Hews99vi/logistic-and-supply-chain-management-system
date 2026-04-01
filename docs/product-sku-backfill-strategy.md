# Product SKU Backfill Strategy

## Goal

Adopt structured SKU fields for legacy products without breaking current product, loading, reporting, or print flows.

## Current assumption

Legacy rows still carry operational pack meaning inside `product_name`, for example `180ml x 24`, `80ml x 48`, or `50g x 120`.

## Structured SKU model

The product model now supports these structured fields:
- `brand`
- `product_family`
- `variant`
- `unit_size`
- `unit_measure`
- `pack_size`
- `selling_unit`
- `display_name`

During transition:
- `display_name` is the preferred UI label
- `product_name` is retained for backward compatibility
- `category` is optional and secondary
- quantity in operational product workflows means `pack/case quantity`

## Safe migration approach

1. Keep `product_name` unchanged for compatibility.
2. Use a one-time, conservative parser only during migration.
3. Populate structured fields only when the name ends in a clearly recognized pattern:
   - `<optional family text> <number><measure> x <pack size>`
   - Supported measures: `ml`, `l`, `g`, `kg`
4. Leave ambiguous rows partially structured instead of guessing.
5. Use `display_name` as the UI-safe label, with frontend fallbacks to legacy `product_name`.
6. Review remaining ambiguous rows through the `public.product_structuring_backfill_review` view.

## Migration output

The backfill migration:
- fills `unit_size`, `unit_measure`, and `pack_size` when confidently recognized
- updates `product_family` only when a clean family prefix is present and the row still looks legacy
- leaves `selling_unit` untouched because values like `pack`, `crate`, or `tray` cannot be inferred safely from `x 24`
- keeps `display_name` populated for legacy-safe reads

## Manual cleanup guidance

Rows marked `manual_review_required` should be reviewed by an operator and updated through the product backend or SQL scripts once the business meaning is confirmed.
