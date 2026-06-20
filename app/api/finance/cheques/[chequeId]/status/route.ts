import { ReceivablesService } from "@/services/finance/receivables.service";

type RouteContext = {
  params: Promise<{ chequeId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { chequeId } = await context.params;
  return ReceivablesService.updateChequeStatus(chequeId, request);
}
