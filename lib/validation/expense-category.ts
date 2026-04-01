import { z } from "zod";

import { paginationQuerySchema } from "@/lib/validation/common";

export const expenseCategoryListQuerySchema = paginationQuerySchema.extend({
  isSystem: z
    .union([z.boolean(), z.string()])
    .transform((value) => {
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

      throw new Error("Expected true or false.");
    })
    .optional()
});

export const expenseCategoryCreateSchema = z.object({
  categoryName: z.string().trim().min(2).max(160),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const expenseCategoryUpdateSchema = expenseCategoryCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one expense category field must be provided."
  });

export type ExpenseCategoryListQuery = z.infer<typeof expenseCategoryListQuerySchema>;
export type ExpenseCategoryCreateInput = z.infer<typeof expenseCategoryCreateSchema>;
export type ExpenseCategoryUpdateInput = z.infer<typeof expenseCategoryUpdateSchema>;
