import { z } from "zod";

export const booleanLikeSchema = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Expected true or false."
  });

  return z.NEVER;
});

export const idSchema = z.string().uuid();
export const uuidSchema = idSchema;

export const moneySchema = z.number().finite().nonnegative();
export const quantitySchema = z.number().int().min(0);
export const positiveIntegerSchema = z.number().int().min(1);
export const isoDateSchema = z.string().date();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  isActive: booleanLikeSchema.optional()
});

export const dateRangeQuerySchema = z.object({
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional()
}).refine((value) => {
  if (!value.dateFrom || !value.dateTo) {
    return true;
  }

  return value.dateFrom <= value.dateTo;
}, {
  message: "dateFrom must be before or equal to dateTo.",
  path: ["dateFrom"]
});

export function getPaginationRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { from, to };
}