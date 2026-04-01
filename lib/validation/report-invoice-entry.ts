import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";

const moneySchema = z.number().finite().nonnegative();

const notesSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  });

const invoiceEntryBaseObjectSchema = z.object({
  invoiceNo: z.string().trim().min(1).max(80),
  cashAmount: moneySchema.default(0),
  chequeAmount: moneySchema.default(0),
  creditAmount: moneySchema.default(0),
  notes: notesSchema
});

function withPositiveAmount<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine((value: z.infer<T>) => {
    const candidate = value as {
      cashAmount?: number;
      chequeAmount?: number;
      creditAmount?: number;
    };

    return (candidate.cashAmount ?? 0) + (candidate.chequeAmount ?? 0) + (candidate.creditAmount ?? 0) > 0;
  }, {
    message: "At least one payment amount must be greater than zero.",
    path: ["cashAmount"]
  });
}

export const reportInvoiceEntryCreateSchema = withPositiveAmount(invoiceEntryBaseObjectSchema.extend({
  lineNo: z.number().int().min(1).optional()
}));

export const reportInvoiceEntryUpdateSchema = z.object({
  lineNo: z.number().int().min(1).optional(),
  invoiceNo: z.string().trim().min(1).max(80).optional(),
  cashAmount: moneySchema.optional(),
  chequeAmount: moneySchema.optional(),
  creditAmount: moneySchema.optional(),
  notes: z.string().trim().max(500).optional().transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  })
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one invoice entry field must be provided."
});

export const reportInvoiceEntryBatchItemSchema = withPositiveAmount(invoiceEntryBaseObjectSchema.extend({
  id: uuidSchema.optional()
}));

export const reportInvoiceEntryBatchSaveSchema = z.object({
  items: z.array(reportInvoiceEntryBatchItemSchema).max(500)
}).superRefine((value, ctx) => {
  const invoiceNos = new Set<string>();
  const ids = new Set<string>();

  value.items.forEach((item, index) => {
    const normalizedInvoiceNo = item.invoiceNo.trim().toLowerCase();
    if (invoiceNos.has(normalizedInvoiceNo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invoice numbers must be unique within the report.",
        path: ["items", index, "invoiceNo"]
      });
    } else {
      invoiceNos.add(normalizedInvoiceNo);
    }

    if (item.id) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate invoice entry ids are not allowed in a batch save.",
          path: ["items", index, "id"]
        });
      } else {
        ids.add(item.id);
      }
    }
  });
});

export type ReportInvoiceEntryCreateInput = z.infer<typeof reportInvoiceEntryCreateSchema>;
export type ReportInvoiceEntryUpdateInput = z.infer<typeof reportInvoiceEntryUpdateSchema>;
export type ReportInvoiceEntryBatchItemInput = z.infer<typeof reportInvoiceEntryBatchItemSchema>;
export type ReportInvoiceEntryBatchSaveInput = z.infer<typeof reportInvoiceEntryBatchSaveSchema>;