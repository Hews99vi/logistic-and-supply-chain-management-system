import { MainInventoryService } from "@/services/inventory/main-inventory.service";

export async function POST(request: Request) {
  return MainInventoryService.receiveStock(request);
}
