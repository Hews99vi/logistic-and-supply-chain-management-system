import { CustomerService } from "@/services/customers/customer.service";

export async function GET(request: Request) {
  return CustomerService.listCustomers(request);
}

export async function POST(request: Request) {
  return CustomerService.createCustomer(request);
}
