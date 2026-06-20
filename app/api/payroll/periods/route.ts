import { PayrollService } from "@/services/reports/payroll.service";

export async function GET() {
  return PayrollService.listPeriods();
}

export async function POST(request: Request) {
  return PayrollService.createPeriod(request);
}
