import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";
import {
  nonNegativeMoneySchema,
  optionalLineNoSchema,
  optionalNotesSchema,
  requireCategoryOrCustomName
} from "@/lib/validation/report-line-item-common";

const customExpenseNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  });

const expenseEntryBaseObjectSchema = z.object({
  expenseCategoryId: uuidSchema.optional().nullable(),
  customExpenseName: customExpenseNameSchema,
  amount: nonNegativeMoneySchema,
  notes: optionalNotesSchema
});

export const reportExpenseEntryCreateSchema = requireCategoryOrCustomName(expenseEntryBaseObjectSchema.extend({
  lineNo: optionalLineNoSchema
}));

export const reportExpenseEntryUpdateSchema = z.object({
  lineNo: optionalLineNoSchema,
  expenseCategoryId: uuidSchema.optional().nullable(),
  customExpenseName: customExpenseNameSchema,
  amount: nonNegativeMoneySchema.optional(),
  notes: optionalNotesSchema
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one expense entry field must be provided."
});

export const reportExpenseEntryBatchItemSchema = requireCategoryOrCustomName(expenseEntryBaseObjectSchema.extend({
  id: uuidSchema.optional()
}));

export const reportExpenseEntryBatchSaveSchema = z.object({
  items: z.array(reportExpenseEntryBatchItemSchema).max(500)
});

export type ReportExpenseEntryCreateInput = z.infer<typeof reportExpenseEntryCreateSchema>;
export type ReportExpenseEntryUpdateInput = z.infer<typeof reportExpenseEntryUpdateSchema>;
export type ReportExpenseEntryBatchItemInput = z.infer<typeof reportExpenseEntryBatchItemSchema>;
export type ReportExpenseEntryBatchSaveInput = z.infer<typeof reportExpenseEntryBatchSaveSchema>;