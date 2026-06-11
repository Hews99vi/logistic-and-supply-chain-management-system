import { DriverDeductionService } from "@/services/reports/driver-deduction.service";

type RouteContext = {
  params: Promise<{ deductionId: string; reportId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { deductionId } = await context.params;
  return DriverDeductionService.resolveDeduction(deductionId, request);
}
