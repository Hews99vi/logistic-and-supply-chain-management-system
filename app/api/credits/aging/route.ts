import { ReceivablesService } from "@/services/finance/receivables.service";

export async function GET() {
  return ReceivablesService.getAging();
}
