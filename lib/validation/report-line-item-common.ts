import { z } from "zod";

export const nonNegativeMoneySchema = z.number().finite().nonnegative();

export const optionalNotesSchema = z
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

export const optionalLineNoSchema = z.number().int().min(1).optional();

export function requireCategoryOrCustomName<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: z.infer<T>, ctx) => {
    const candidate = value as {
      expenseCategoryId?: string | null;
      customExpenseName?: string | null;
    };

    const hasCategory = !!candidate.expenseCategoryId;
    const hasCustomName = !!candidate.customExpenseName;

    if (!hasCategory && !hasCustomName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either expenseCategoryId or customExpenseName is required.",
        path: ["expenseCategoryId"]
      });
    }
  });
}