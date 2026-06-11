import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";
import { optionalLineNoSchema } from "@/lib/validation/report-line-item-common";

const unitQuantitySchema = z.number().int().min(0);
const moneySnapshotSchema = z.number().nonnegative();

function withValidInventoryQuantities<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const candidate = value as {
      loadingQty?: number;
      salesQty?: number;
      costedSalesQty?: number;
    };

    if ((candidate.salesQty ?? 0) > (candidate.loadingQty ?? 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "salesQty cannot exceed loadingQty. Quantities are recorded as selling units.",
        path: ["salesQty"]
      });
    }

    if (candidate.costedSalesQty !== undefined && candidate.costedSalesQty > (candidate.salesQty ?? 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "costedSalesQty cannot exceed salesQty.",
        path: ["costedSalesQty"]
      });
    }
  });
}

const inventoryEntryBaseObjectSchema = z.object({
  productId: uuidSchema,
  loadingQty: unitQuantitySchema.default(0),
  salesQty: unitQuantitySchema.default(0),
  lorryQty: unitQuantitySchema.default(0),
  salesRevenue: moneySnapshotSchema.optional(),
  costedSalesQty: unitQuantitySchema.optional()
});

export const reportInventoryEntryCreateSchema = withValidInventoryQuantities(inventoryEntryBaseObjectSchema.extend({
  lineNo: optionalLineNoSchema
}));

export const reportInventoryEntryUpdateSchema = z.object({
  lineNo: optionalLineNoSchema,
  productId: uuidSchema.optional(),
  loadingQty: unitQuantitySchema.optional(),
  salesQty: unitQuantitySchema.optional(),
  lorryQty: unitQuantitySchema.optional(),
  salesRevenue: moneySnapshotSchema.optional(),
  costedSalesQty: unitQuantitySchema.optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one inventory entry field must be provided."
});

export const reportInventoryEntryBatchItemSchema = withValidInventoryQuantities(inventoryEntryBaseObjectSchema.extend({
  id: uuidSchema.optional()
}));

export const reportInventoryEntryBatchSaveSchema = z.object({
  items: z.array(reportInventoryEntryBatchItemSchema).max(500)
}).superRefine((value, ctx) => {
  const productIds = new Set<string>();
  const ids = new Set<string>();

  value.items.forEach((item, index) => {
    if (productIds.has(item.productId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each product may only appear once per report.",
        path: ["items", index, "productId"]
      });
    } else {
      productIds.add(item.productId);
    }

    if (item.id) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate inventory entry ids are not allowed in a batch save.",
          path: ["items", index, "id"]
        });
      } else {
        ids.add(item.id);
      }
    }
  });
});

export type ReportInventoryEntryCreateInput = z.infer<typeof reportInventoryEntryCreateSchema>;
export type ReportInventoryEntryUpdateInput = z.infer<typeof reportInventoryEntryUpdateSchema>;
export type ReportInventoryEntryBatchItemInput = z.infer<typeof reportInventoryEntryBatchItemSchema>;
export type ReportInventoryEntryBatchSaveInput = z.infer<typeof reportInventoryEntryBatchSaveSchema>;
