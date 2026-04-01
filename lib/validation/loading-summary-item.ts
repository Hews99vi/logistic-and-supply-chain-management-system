import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";

const packQuantitySchema = z.number().int().min(0);

export const loadingSummaryItemSchema = z.object({
  id: uuidSchema.optional(),
  productId: uuidSchema,
  loadingQty: packQuantitySchema,
  salesQty: packQuantitySchema,
  lorryQty: packQuantitySchema
}).superRefine((value, ctx) => {
  if (value.salesQty > value.loadingQty) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sold quantity cannot exceed loaded quantity.",
      path: ["salesQty"]
    });
  }
});

export const loadingSummaryItemBatchSaveSchema = z.object({
  items: z.array(loadingSummaryItemSchema).max(500)
}).superRefine((value, ctx) => {
  const seenProductIds = new Set<string>();
  const seenIds = new Set<string>();

  value.items.forEach((item, index) => {
    if (seenProductIds.has(item.productId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each product may only appear once per loading summary.",
        path: ["items", index, "productId"]
      });
    } else {
      seenProductIds.add(item.productId);
    }

    if (item.id) {
      if (seenIds.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate loading summary item ids are not allowed.",
          path: ["items", index, "id"]
        });
      } else {
        seenIds.add(item.id);
      }
    }
  });
});

export type LoadingSummaryItemInput = z.infer<typeof loadingSummaryItemSchema>;
export type LoadingSummaryItemBatchSaveInput = z.infer<typeof loadingSummaryItemBatchSaveSchema>;

