import { DailyReportWorkspaceView } from "@/features/reports/components/daily-report-workspace-view";

type ReportDetailPageProps = {
  params: Promise<{
    reportId: string;
  }>;
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const { reportId } = await params;

  return <DailyReportWorkspaceView reportId={reportId} />;
}
