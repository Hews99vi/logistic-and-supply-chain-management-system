import { z } from "zod";

import { paginationQuerySchema } from "@/lib/validation/common";

export const productCategorySchema = z.enum([
  "MILK",
  "YOGURT",
  "CHEESE",
  "BUTTER",
  "ICE_CREAM",
  "OTHER"
]);

export const productQuantityEntryModeSchema = z.enum(["pack", "unit"]);

const optionalTextField = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      return trimmed.slice(0, max);
    });

const optionalPositiveNumberField = z.union([z.number(), z.null()]).optional();
const optionalPositiveIntegerField = z.union([z.number().int(), z.null()]).optional();

function validateStructuredProductFields<T extends z.ZodTypeAny>(schema: T, options?: { requireIdentity?: boolean }) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const candidate = value as {
      productName?: string | null;
      productFamily?: string | null;
      displayName?: string | null;
      unitSize?: number | null;
      packSize?: number | null;
      quantityEntryMode?: "pack" | "unit" | null;
    };

    if (options?.requireIdentity && (candidate.productName ?? candidate.productFamily ?? candidate.displayName) == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of productName, productFamily, or displayName.",
        path: ["productFamily"]
      });
    }

    if (candidate.unitSize !== null && candidate.unitSize !== undefined && candidate.unitSize <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unitSize must be greater than zero when provided.",
        path: ["unitSize"]
      });
    }

    if (candidate.packSize !== null && candidate.packSize !== undefined && candidate.packSize <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "packSize must be greater than zero when provided.",
        path: ["packSize"]
      });
    }

    if (
      candidate.quantityEntryMode === "unit"
      && candidate.packSize !== null
      && candidate.packSize !== undefined
      && candidate.packSize <= 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "packSize should be greater than 1 when unit-tracked products need pack conversion.",
        path: ["packSize"]
      });
    }
  });
}

const productBaseSchema = z.object({
  productCode: z.string().trim().min(2).max(64),
  productName: optionalTextField(160),
  category: productCategorySchema.optional(),
  unitPrice: z.number().nonnegative(),
  sku: optionalTextField(64),
  brand: optionalTextField(120),
  productFamily: optionalTextField(160),
  variant: optionalTextField(160),
  unitSize: optionalPositiveNumberField,
  unitMeasure: optionalTextField(32),
  packSize: optionalPositiveIntegerField,
  sellingUnit: optionalTextField(64),
  quantityEntryMode: z.union([productQuantityEntryModeSchema, z.null()]).optional(),
  displayName: optionalTextField(200),
  isActive: z.boolean().default(true)
});

export const productListQuerySchema = paginationQuerySchema.extend({
  category: productCategorySchema.optional()
});

export const productCreateSchema = validateStructuredProductFields(productBaseSchema, { requireIdentity: true });

export const productUpdateSchema = validateStructuredProductFields(productBaseSchema.partial())
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one product field must be provided."
  });

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
