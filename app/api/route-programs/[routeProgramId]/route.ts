import { RouteProgramService } from "@/services/route-programs/route-program.service";

type RouteContext = {
  params: Promise<{
    routeProgramId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { routeProgramId } = await context.params;
  return RouteProgramService.getRouteProgramById(routeProgramId);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { routeProgramId } = await context.params;
  return RouteProgramService.updateRouteProgram(routeProgramId, request);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { routeProgramId } = await context.params;
  return RouteProgramService.deactivateRouteProgram(routeProgramId);
}
