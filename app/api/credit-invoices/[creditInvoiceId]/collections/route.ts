import { ReceivablesService } from "@/services/finance/receivables.service";

type RouteContext = {
  params: Promise<{ creditInvoiceId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { creditInvoiceId } = await context.params;
  return ReceivablesService.postCollection(creditInvoiceId, request);
}
