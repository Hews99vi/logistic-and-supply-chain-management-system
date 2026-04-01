import { ReportAttachmentService } from "@/services/reports/report-attachment.service";

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportAttachmentService.listAttachments(reportId);
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportAttachmentService.uploadAttachment(reportId, request);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  return ReportAttachmentService.deleteAttachment(reportId, request);
}
