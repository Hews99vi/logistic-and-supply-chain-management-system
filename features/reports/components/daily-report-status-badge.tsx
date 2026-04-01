"use client";

import type { DailyReportStatus } from "@/types/domain/report";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<DailyReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected"
};

const STATUS_VARIANT: Record<DailyReportStatus, "secondary" | "success" | "warning" | "danger"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success",
  rejected: "danger"
};

export function DailyReportStatusBadge({ status }: { status: DailyReportStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
