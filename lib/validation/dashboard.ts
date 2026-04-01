import { z } from "zod";

export const dashboardReportQuerySchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  routeProgramId: z.string().uuid().optional(),
  top: z.coerce.number().int().min(1).max(100).default(10)
}).refine((value) => {
  if (!value.dateFrom || !value.dateTo) {
    return true;
  }

  return value.dateFrom <= value.dateTo;
}, {
  message: "dateFrom must be before or equal to dateTo.",
  path: ["dateFrom"]
});

export type DashboardReportQuery = z.infer<typeof dashboardReportQuerySchema>;