import { DailyReportWorkspaceView } from "@/features/reports/components/daily-report-workspace-view";
import { requireProtectedPage } from "@/lib/auth/page-guard";

type ReportDetailPageProps = {
  params: Promise<{
    reportId: string;
  }>;
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const { reportId } = await params;
  await requireProtectedPage(`/reports/${reportId}`);

  return <DailyReportWorkspaceView reportId={reportId} />;
}
