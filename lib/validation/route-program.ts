import { z } from "zod";

import { paginationQuerySchema } from "@/lib/validation/common";

export const routeProgramListQuerySchema = paginationQuerySchema.extend({
  territory: z.string().trim().min(1).max(160).optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional()
});

export const routeProgramCreateSchema = z.object({
  territoryName: z.string().trim().min(2).max(160),
  dayOfWeek: z.number().int().min(1).max(7),
  frequencyLabel: z.string().trim().min(2).max(80),
  routeName: z.string().trim().min(2).max(160),
  routeDescription: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true)
});

export const routeProgramUpdateSchema = routeProgramCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one route program field must be provided."
  });

export type RouteProgramListQuery = z.infer<typeof routeProgramListQuerySchema>;
export type RouteProgramCreateInput = z.infer<typeof routeProgramCreateSchema>;
export type RouteProgramUpdateInput = z.infer<typeof routeProgramUpdateSchema>;
