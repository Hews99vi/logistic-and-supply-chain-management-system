import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";
import { optionalLineNoSchema } from "@/lib/validation/report-line-item-common";

const packQuantitySchema = z.number().int().min(0);

function withValidInventoryQuantities<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const candidate = value as {
      loadingQty?: number;
      salesQty?: number;
    };

    if ((candidate.salesQty ?? 0) > (candidate.loadingQty ?? 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "salesQty cannot exceed loadingQty. Quantities follow the product's configured quantity mode.",
        path: ["salesQty"]
      });
    }
  });
}

const inventoryEntryBaseObjectSchema = z.object({
  productId: uuidSchema,
  loadingQty: packQuantitySchema.default(0),
  salesQty: packQuantitySchema.default(0),
  lorryQty: packQuantitySchema.default(0)
});

export const reportInventoryEntryCreateSchema = withValidInventoryQuantities(inventoryEntryBaseObjectSchema.extend({
  lineNo: optionalLineNoSchema
}));

export const reportInventoryEntryUpdateSchema = z.object({
  lineNo: optionalLineNoSchema,
  productId: uuidSchema.optional(),
  loadingQty: packQuantitySchema.optional(),
  salesQty: packQuantitySchema.optional(),
  lorryQty: packQuantitySchema.optional()
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

