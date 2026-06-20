import { CustomerService } from "@/services/customers/customer.service";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { matchId } = await context.params;
  return CustomerService.resolveUnmatchedCustomer(matchId, request);
}
