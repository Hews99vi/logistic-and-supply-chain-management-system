import { MainInventoryService } from "@/services/inventory/main-inventory.service";

export async function GET(request: Request) {
  return MainInventoryService.list(request);
}
