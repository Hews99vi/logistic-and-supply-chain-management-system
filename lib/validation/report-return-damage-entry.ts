import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";
import { optionalNotesSchema } from "@/lib/validation/report-line-item-common";

const packQuantitySchema = z.number().int().min(0);

const optionalTrimmedString = (max: number) => z
  .string()
  .trim()
  .max(max)
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  });

function withValidReturnDamageQuantities<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const candidate = value as {
      damageQty?: number;
      returnQty?: number;
      freeIssueQty?: number;
    };

    const total = (candidate.damageQty ?? 0) + (candidate.returnQty ?? 0) + (candidate.freeIssueQty ?? 0);

    if (total <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of damageQty, returnQty, or freeIssueQty must be greater than zero. Quantities follow the product's configured quantity mode.",
        path: ["damageQty"]
      });
    }
  });
}

const returnDamageBaseObjectSchema = z.object({
  productId: uuidSchema,
  invoiceNo: optionalTrimmedString(80),
  shopName: optionalTrimmedString(160),
  damageQty: packQuantitySchema.default(0),
  returnQty: packQuantitySchema.default(0),
  freeIssueQty: packQuantitySchema.default(0),
  notes: optionalNotesSchema
});

export const reportReturnDamageEntryCreateSchema = withValidReturnDamageQuantities(returnDamageBaseObjectSchema);

export const reportReturnDamageEntryUpdateSchema = z.object({
  productId: uuidSchema.optional(),
  invoiceNo: optionalTrimmedString(80),
  shopName: optionalTrimmedString(160),
  damageQty: packQuantitySchema.optional(),
  returnQty: packQuantitySchema.optional(),
  freeIssueQty: packQuantitySchema.optional(),
  notes: optionalNotesSchema
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one return or damage field must be provided."
});

export const reportReturnDamageEntryBatchItemSchema = withValidReturnDamageQuantities(returnDamageBaseObjectSchema.extend({
  id: uuidSchema.optional()
}));

export const reportReturnDamageEntryBatchSaveSchema = z.object({
  items: z.array(reportReturnDamageEntryBatchItemSchema).max(500)
}).superRefine((value, ctx) => {
  const ids = new Set<string>();

  value.items.forEach((item, index) => {
    if (item.id) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate return or damage entry ids are not allowed in a batch save.",
          path: ["items", index, "id"]
        });
      } else {
        ids.add(item.id);
      }
    }
  });
});

export type ReportReturnDamageEntryCreateInput = z.infer<typeof reportReturnDamageEntryCreateSchema>;
export type ReportReturnDamageEntryUpdateInput = z.infer<typeof reportReturnDamageEntryUpdateSchema>;
export type ReportReturnDamageEntryBatchItemInput = z.infer<typeof reportReturnDamageEntryBatchItemSchema>;
export type ReportReturnDamageEntryBatchSaveInput = z.infer<typeof reportReturnDamageEntryBatchSaveSchema>;

