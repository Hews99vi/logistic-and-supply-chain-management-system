import { z } from "zod";

import { paginationQuerySchema } from "@/lib/validation/common";

export const customerChannelSchema = z.enum(["RETAIL", "WHOLESALE", "INSTITUTIONAL"]);
export const customerStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const customerListQuerySchema = paginationQuerySchema.extend({
  territory: z.string().trim().min(1).max(100).optional(),
  assignment: z.string().trim().min(1).max(100).optional(),
  status: customerStatusSchema.optional()
});

export const customerCreateSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(200),
  channel: customerChannelSchema,
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  addressLine1: z.string().trim().max(250).nullable().optional(),
  addressLine2: z.string().trim().max(250).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  status: customerStatusSchema.default("ACTIVE")
});

export const customerUpdateSchema = customerCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one customer field must be provided."
  });

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
