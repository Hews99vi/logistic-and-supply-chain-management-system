import { CustomerService } from "@/services/customers/customer.service";

export async function GET() {
  return CustomerService.listUnmatchedCustomers();
}
