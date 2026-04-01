import { CustomerService } from "@/services/customers/customer.service";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { customerId } = await context.params;
  return CustomerService.getCustomerById(customerId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { customerId } = await context.params;
  return CustomerService.updateCustomer(customerId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { customerId } = await context.params;
  return CustomerService.deactivateCustomer(customerId);
}
