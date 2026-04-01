import { z } from "zod";

export const DEFAULT_CASH_DENOMINATION_VALUES = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1] as const;

export const cashDenominationValueSchema = z.union([
  z.literal(5000),
  z.literal(1000),
  z.literal(500),
  z.literal(100),
  z.literal(50),
  z.literal(20),
  z.literal(10),
  z.literal(5),
  z.literal(2),
  z.literal(1)
]);

const noteCountSchema = z.number().int().min(0);

export const reportCashDenominationUpdateSchema = z.object({
  noteCount: noteCountSchema
});

export const reportCashDenominationBatchItemSchema = z.object({
  denominationValue: cashDenominationValueSchema,
  noteCount: noteCountSchema
});

export const reportCashDenominationBatchSaveSchema = z.object({
  items: z.array(reportCashDenominationBatchItemSchema).length(DEFAULT_CASH_DENOMINATION_VALUES.length)
}).superRefine((value, ctx) => {
  const seen = new Set<number>();

  value.items.forEach((item, index) => {
    if (seen.has(item.denominationValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each denomination may only appear once.",
        path: ["items", index, "denominationValue"]
      });
    } else {
      seen.add(item.denominationValue);
    }
  });

  DEFAULT_CASH_DENOMINATION_VALUES.forEach((denominationValue) => {
    if (!seen.has(denominationValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing denomination ${denominationValue}.`,
        path: ["items"]
      });
    }
  });
});

export type ReportCashDenominationUpdateInput = z.infer<typeof reportCashDenominationUpdateSchema>;
export type ReportCashDenominationBatchItemInput = z.infer<typeof reportCashDenominationBatchItemSchema>;
export type ReportCashDenominationBatchSaveInput = z.infer<typeof reportCashDenominationBatchSaveSchema>;