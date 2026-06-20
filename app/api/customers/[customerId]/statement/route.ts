import { CustomerService } from "@/services/customers/customer.service";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { customerId } = await context.params;
  return CustomerService.getCustomerStatement(customerId);
}
