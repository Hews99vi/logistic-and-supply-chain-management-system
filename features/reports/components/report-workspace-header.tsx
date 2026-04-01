"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DailyReportStatusBadge } from "@/features/reports/components/daily-report-status-badge";
import type { DailyReportStatus } from "@/types/domain/report";

type ReportWorkspaceHeaderProps = {
  reportId: string;
  status: DailyReportStatus;
  saving: boolean;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canReopen: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
};

export function ReportWorkspaceHeader({
  reportId,
  status,
  saving,
  canSaveDraft,
  canSubmit,
  canApprove,
  canReject,
  canReopen,
  onSaveDraft,
  onSubmit,
  onApprove,
  onReject,
  onReopen
}: ReportWorkspaceHeaderProps) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/reports" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Daily Reports
              </Link>
            </Button>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Operations / Daily Report</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Report Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">ID: {reportId}</p>
        </div>

        <div className="flex items-center gap-2">
          <DailyReportStatusBadge status={status} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/loading-summaries/${reportId}`}>Morning Loading</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/reports/${reportId}/date`}>DATE Sheet</Link>
        </Button>
        {canSaveDraft ? <Button variant="outline" onClick={onSaveDraft} disabled={saving}>Save Draft</Button> : null}
        {canSubmit ? <Button onClick={onSubmit} disabled={saving}>Submit</Button> : null}
        {canApprove ? <Button onClick={onApprove} disabled={saving}>Approve</Button> : null}
        {canReject ? <Button variant="outline" onClick={onReject} disabled={saving}>Reject</Button> : null}
        {canReopen ? <Button variant="secondary" onClick={onReopen} disabled={saving}>Reopen</Button> : null}
      </div>
    </header>
  );
}

