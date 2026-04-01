import { z } from "zod";

import { paginationQuerySchema, uuidSchema } from "@/lib/validation/common";
import { dailyReportStatusSchema } from "@/lib/validation/daily-report";

export const loadingSummarySortKeySchema = z.enum([
  "reportDate",
  "routeNameSnapshot",
  "territoryNameSnapshot",
  "staffName",
  "status",
  "updatedAt",
  "loadingCompletedAt"
]);

export const loadingSummarySortDirectionSchema = z.enum(["asc", "desc"]);

export const loadingSummaryListQuerySchema = paginationQuerySchema.extend({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  routeProgramId: uuidSchema.optional(),
  status: dailyReportStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  onlyCompleted: z.coerce.boolean().optional(),
  sortKey: loadingSummarySortKeySchema.default("reportDate"),
  sortDirection: loadingSummarySortDirectionSchema.default("desc")
}).refine((value) => {
  if (!value.dateFrom || !value.dateTo) {
    return true;
  }

  return value.dateFrom <= value.dateTo;
}, {
  message: "dateFrom must be before or equal to dateTo.",
  path: ["dateFrom"]
});

export const loadingSummaryCreateSchema = z.object({
  reportDate: z.string().date(),
  routeProgramId: uuidSchema,
  staffName: z.string().trim().min(2).max(160),
  remarks: z.string().trim().max(1000).optional(),
  loadingNotes: z.string().trim().max(2000).optional()
});

export const loadingSummaryUpdateSchema = z.object({
  reportDate: z.string().date().optional(),
  staffName: z.string().trim().min(2).max(160).optional(),
  remarks: z.string().trim().max(1000).optional(),
  loadingNotes: z.string().trim().max(2000).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one loading summary field must be provided."
});

export const loadingSummaryFinalizeSchema = z.object({
  loadingNotes: z.string().trim().max(2000).optional()
});

export type LoadingSummaryListQuery = z.infer<typeof loadingSummaryListQuerySchema>;
export type LoadingSummaryCreateInput = z.infer<typeof loadingSummaryCreateSchema>;
export type LoadingSummaryUpdateInput = z.infer<typeof loadingSummaryUpdateSchema>;
export type LoadingSummaryFinalizeInput = z.infer<typeof loadingSummaryFinalizeSchema>;
