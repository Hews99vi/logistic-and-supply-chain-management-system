import { RouteProgramService } from "@/services/route-programs/route-program.service";

export async function GET(request: Request) {
  return RouteProgramService.listRoutePrograms(request);
}

export async function POST(request: Request) {
  return RouteProgramService.createRouteProgram(request);
}
