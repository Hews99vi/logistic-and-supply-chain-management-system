import { AuthService } from "@/services/auth/auth.service";

export async function POST(request: Request) {
  return AuthService.registerPendingUser(request);
}
