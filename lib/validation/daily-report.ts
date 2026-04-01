import { z } from "zod";

import { paginationQuerySchema } from "@/lib/validation/common";

export const dailyReportStatusSchema = z.enum(["draft", "submitted", "approved", "rejected"]);
export const dailyReportSortKeySchema = z.enum([
  "reportDate",
  "routeNameSnapshot",
  "territoryNameSnapshot",
  "staffName",
  "status",
  "totalSale",
  "netProfit",
  "updatedAt"
]);
export const dailyReportSortDirectionSchema = z.enum(["asc", "desc"]);

const dailyReportCreateBaseSchema = z.object({
  reportDate: z.string().date(),
  routeProgramId: z.string().uuid(),
  staffName: z.string().trim().min(2).max(160),
  remarks: z.string().trim().max(1000).optional(),
  totalSale: z.number().nonnegative().default(0),
  dbMarginPercent: z.number().min(-100).max(100).default(0),
  cashInHand: z.number().nonnegative().default(0),
  cashInBank: z.number().nonnegative().default(0),
  totalBillCount: z.number().int().min(0).default(0),
  deliveredBillCount: z.number().int().min(0).default(0),
  cancelledBillCount: z.number().int().min(0).default(0)
});

export const dailyReportCreateSchema = dailyReportCreateBaseSchema.refine((value) => {
  return value.deliveredBillCount + value.cancelledBillCount <= value.totalBillCount;
}, {
  message: "Delivered and cancelled bill counts cannot exceed total bill count.",
  path: ["deliveredBillCount"]
});

const dailyReportUpdateBaseSchema = dailyReportCreateBaseSchema.partial().extend({
  reportDate: z.string().date().optional(),
  routeProgramId: z.string().uuid().optional(),
  deletedAt: z.never().optional(),
  status: z.never().optional(),
  submittedAt: z.never().optional(),
  approvedAt: z.never().optional(),
  rejectedAt: z.never().optional()
});

export const dailyReportUpdateSchema = dailyReportUpdateBaseSchema.refine((value: Record<string, unknown>) => {
  return Object.keys(value).length > 0;
}, {
  message: "At least one report field must be provided."
}).refine((value: z.infer<typeof dailyReportUpdateBaseSchema>) => {
  if (
    value.totalBillCount === undefined &&
    value.deliveredBillCount === undefined &&
    value.cancelledBillCount === undefined
  ) {
    return true;
  }

  const total = value.totalBillCount ?? Number.MAX_SAFE_INTEGER;
  const delivered = value.deliveredBillCount ?? 0;
  const cancelled = value.cancelledBillCount ?? 0;

  return delivered + cancelled <= total;
}, {
  message: "Delivered and cancelled bill counts cannot exceed total bill count.",
  path: ["deliveredBillCount"]
});

const dailyReportListQueryBaseSchema = paginationQuerySchema.extend({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  routeProgramId: z.string().uuid().optional(),
  territory: z.string().trim().min(1).max(160).optional(),
  status: dailyReportStatusSchema.optional(),
  createdBy: z.string().uuid().optional(),
  sortKey: dailyReportSortKeySchema.default("updatedAt"),
  sortDirection: dailyReportSortDirectionSchema.default("desc")
});

export const dailyReportListQuerySchema = dailyReportListQueryBaseSchema.refine((value) => {
  if (!value.dateFrom || !value.dateTo) {
    return true;
  }

  return value.dateFrom <= value.dateTo;
}, {
  message: "dateFrom must be before or equal to dateTo.",
  path: ["dateFrom"]
});

const dailyReportSummaryQueryBaseSchema = dailyReportListQueryBaseSchema.omit({
  page: true,
  pageSize: true,
  search: true,
  isActive: true,
  sortKey: true,
  sortDirection: true
});

export const dailyReportSummaryQuerySchema = dailyReportSummaryQueryBaseSchema.refine((value) => {
  if (!value.dateFrom || !value.dateTo) {
    return true;
  }

  return value.dateFrom <= value.dateTo;
}, {
  message: "dateFrom must be before or equal to dateTo.",
  path: ["dateFrom"]
});

export type DailyReportCreateInput = z.infer<typeof dailyReportCreateSchema>;
export type DailyReportUpdateInput = z.infer<typeof dailyReportUpdateSchema>;
export type DailyReportListQuery = z.infer<typeof dailyReportListQuerySchema>;
export type DailyReportSummaryQuery = z.infer<typeof dailyReportSummaryQuerySchema>;

