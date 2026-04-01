import { AuthService } from "@/services/auth/auth.service";

export async function GET() {
  return AuthService.getCurrentSession();
}
