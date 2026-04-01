import { handleRoute } from "@/lib/api/response";

export async function GET() {
  return handleRoute(async () => ({
    status: "ok",
    service: "dairy-distribution-ops-backend",
    timestamp: new Date().toISOString()
  }));
}