"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_QUANTITY_ENTRY_MODE_OPTIONS,
  PRODUCT_SELLING_UNIT_OPTIONS,
  PRODUCT_UNIT_MEASURE_OPTIONS,
  buildProductDisplayNamePreview,
  type ProductFormState,
  type ProductFormValues
} from "@/features/products/types";

const nonNegativeNumberField = z
  .string()
  .trim()
  .min(1, "Rate is required.")
  .refine((value) => !Number.isNaN(Number(value)), "Rate must be a number.")
  .refine((value) => Number(value) >= 0, "Rate must be 0 or greater.");

const optionalPositiveNumberField = z
  .string()
  .trim()
  .refine((value) => value === "" || (!Number.isNaN(Number(value)) && Number(value) > 0), "Enter a number greater than 0.");

const optionalPositiveIntegerField = z
  .string()
  .trim()
  .refine((value) => value === "" || (Number.isInteger(Number(value)) && Number(value) > 0), "Enter a whole number greater than 0.");

const productFormSchema = z.object({
  productCode: z.string().trim().min(2, "Product code must be at least 2 characters.").max(64),
  brand: z.string().trim().max(120),
  productFamily: z.string().trim().min(2, "Product family is required.").max(160),
  variant: z.string().trim().max(160),
  unitSize: optionalPositiveNumberField,
  unitMeasure: z.union([z.literal(""), z.enum(["ml", "l", "g", "kg"])]),
  packSize: optionalPositiveIntegerField,
  sellingUnit: z.union([z.literal(""), z.enum(["pack", "crate", "tray", "carton", "unit"])]),
  quantityEntryMode: z.enum(["pack", "unit"]),
  category: z.union([z.literal(""), z.enum(["MILK", "YOGURT", "CHEESE", "BUTTER", "ICE_CREAM", "OTHER"])]),
  unitPrice: nonNegativeNumberField,
  isActive: z.boolean()
}).superRefine((value, ctx) => {
  const hasUnitSize = value.unitSize.trim().length > 0;
  const hasUnitMeasure = value.unitMeasure.trim().length > 0;

  if (hasUnitSize !== hasUnitMeasure) {
    const message = "Provide both unit size and unit measure together.";
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasUnitSize ? ["unitMeasure"] : ["unitSize"],
      message
    });
  }
});

type ProductFormModalProps = {
  formState: ProductFormState;
  formError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: (next: ProductFormValues) => void;
  onSubmit: () => Promise<void> | void;
};

export function ProductFormPanel({ formState, formError, submitting, onClose, onChange, onSubmit }: ProductFormModalProps) {
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProductFormValues, string>>>({});
  const isCreate = formState.mode === "create";
  const productCodeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFieldErrors({});
  }, [formState.mode, formState.productId]);

  const title = useMemo(() => (isCreate ? "Add New Product" : "Edit Product"), [isCreate]);
  const displayNamePreview = useMemo(() => buildProductDisplayNamePreview(formState.values), [formState.values]);
  const previewLabel = displayNamePreview || formState.legacyProductName || "Display name will be generated from the SKU details.";
  const quantityModeDescription = PRODUCT_QUANTITY_ENTRY_MODE_OPTIONS.find(
    (option) => option.value === formState.values.quantityEntryMode
  )?.description;

  const handleSubmit = async () => {
    const parsed = productFormSchema.safeParse(formState.values);

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof ProductFormValues, string>> = {};

      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof ProductFormValues | undefined;
        if (key && !nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      });

      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    await onSubmit();
  };

  const inputClass = "h-10 w-full rounded-md border px-3 text-sm outline-none ring-offset-2 transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        initialFocusRef={productCodeRef}
        aria-labelledby="product-form-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 id="product-form-title" className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Create and maintain sellable SKUs for daily distribution operations.</p>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {formError ? <Alert variant="destructive">{formError}</Alert> : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Display Name Preview</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{previewLabel}</p>
            {!displayNamePreview && formState.legacyProductName ? (
              <p className="mt-1 text-xs text-slate-500">Legacy product name shown until enough structured fields are entered.</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product Code</span>
              <input
                ref={productCodeRef}
                value={formState.values.productCode}
                onChange={(event) => onChange({ ...formState.values, productCode: event.target.value })}
                placeholder="PRD-001"
                className={`${inputClass} ${fieldErrors.productCode ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.productCode)}
              />
              {fieldErrors.productCode ? <p className="text-xs text-red-600">{fieldErrors.productCode}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Brand</span>
              <input
                value={formState.values.brand}
                onChange={(event) => onChange({ ...formState.values, brand: event.target.value })}
                placeholder="Anchor"
                className={`${inputClass} ${fieldErrors.brand ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.brand)}
              />
              {fieldErrors.brand ? <p className="text-xs text-red-600">{fieldErrors.brand}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product Family</span>
              <input
                value={formState.values.productFamily}
                onChange={(event) => onChange({ ...formState.values, productFamily: event.target.value })}
                placeholder="Fresh Milk"
                className={`${inputClass} ${fieldErrors.productFamily ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.productFamily)}
              />
              {fieldErrors.productFamily ? <p className="text-xs text-red-600">{fieldErrors.productFamily}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Variant / Flavor</span>
              <input
                value={formState.values.variant}
                onChange={(event) => onChange({ ...formState.values, variant: event.target.value })}
                placeholder="Full Cream"
                className={`${inputClass} ${fieldErrors.variant ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.variant)}
              />
              {fieldErrors.variant ? <p className="text-xs text-red-600">{fieldErrors.variant}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unit Size</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formState.values.unitSize}
                onChange={(event) => onChange({ ...formState.values, unitSize: event.target.value })}
                placeholder="180"
                className={`${inputClass} ${fieldErrors.unitSize ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.unitSize)}
              />
              {fieldErrors.unitSize ? <p className="text-xs text-red-600">{fieldErrors.unitSize}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unit Measure</span>
              <select
                value={formState.values.unitMeasure}
                onChange={(event) => onChange({ ...formState.values, unitMeasure: event.target.value as ProductFormValues["unitMeasure"] })}
                className={`${inputClass} ${fieldErrors.unitMeasure ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.unitMeasure)}
              >
                <option value="">Select measure</option>
                {PRODUCT_UNIT_MEASURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.unitMeasure ? <p className="text-xs text-red-600">{fieldErrors.unitMeasure}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pack Size</span>
              <input
                type="number"
                min={1}
                step="1"
                value={formState.values.packSize}
                onChange={(event) => onChange({ ...formState.values, packSize: event.target.value })}
                placeholder="24"
                className={`${inputClass} ${fieldErrors.packSize ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.packSize)}
              />
              {fieldErrors.packSize ? <p className="text-xs text-red-600">{fieldErrors.packSize}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Selling Unit</span>
              <select
                value={formState.values.sellingUnit}
                onChange={(event) => onChange({ ...formState.values, sellingUnit: event.target.value as ProductFormValues["sellingUnit"] })}
                className={`${inputClass} ${fieldErrors.sellingUnit ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.sellingUnit)}
              >
                <option value="">Select selling unit</option>
                {PRODUCT_SELLING_UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.sellingUnit ? <p className="text-xs text-red-600">{fieldErrors.sellingUnit}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quantity Entry Mode</span>
              <select
                value={formState.values.quantityEntryMode}
                onChange={(event) => onChange({ ...formState.values, quantityEntryMode: event.target.value as ProductFormValues["quantityEntryMode"] })}
                className={`${inputClass} ${fieldErrors.quantityEntryMode ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.quantityEntryMode)}
              >
                {PRODUCT_QUANTITY_ENTRY_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{quantityModeDescription}</p>
              {fieldErrors.quantityEntryMode ? <p className="text-xs text-red-600">{fieldErrors.quantityEntryMode}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rate (LKR)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formState.values.unitPrice}
                onChange={(event) => onChange({ ...formState.values, unitPrice: event.target.value })}
                placeholder="0.00"
                className={`${inputClass} ${fieldErrors.unitPrice ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.unitPrice)}
              />
              {fieldErrors.unitPrice ? <p className="text-xs text-red-600">{fieldErrors.unitPrice}</p> : null}
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
              <select
                value={formState.values.isActive ? "active" : "inactive"}
                onChange={(event) => onChange({ ...formState.values, isActive: event.target.value === "active" })}
                className={`${inputClass} border-slate-200`}
                disabled={submitting}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Category</span>
              <select
                value={formState.values.category}
                onChange={(event) => onChange({ ...formState.values, category: event.target.value as ProductFormValues["category"] })}
                className={`${inputClass} ${fieldErrors.category ? "border-red-300" : "border-slate-200"}`}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.category)}
              >
                <option value="">Optional category</option>
                {PRODUCT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.category ? <p className="text-xs text-red-600">{fieldErrors.category}</p> : null}
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isCreate ? "Create Product" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
