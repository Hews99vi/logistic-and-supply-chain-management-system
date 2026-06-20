import { PayrollService } from "@/services/reports/payroll.service";

type RouteContext = {
  params: Promise<{ periodId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { periodId } = await context.params;
  return PayrollService.finalizePeriod(periodId);
}
