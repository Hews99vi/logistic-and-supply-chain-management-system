import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/reports",
  "/loading-summaries",
  "/main-inventory",
  "/products",
  "/route-programs",
  "/customers"
] as const;

const PROTECTED_API_PREFIXES = [
  "/api/admin",
  "/api/auth/me",
  "/api/customers",
  "/api/dashboard",
  "/api/expense-categories",
  "/api/loading-summaries",
  "/api/main-inventory",
  "/api/products",
  "/api/reports",
  "/api/route-programs"
] as const;

const PUBLIC_API_PREFIXES = [
  "/api/auth/signup",
  "/api/health"
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isProtectedPage(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

function isProtectedApi(pathname: string) {
  if (PUBLIC_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return false;
  }

  return PROTECTED_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    if (isProtectedApi(pathname)) {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
          { status: 401 }
        );
      }
    }

    return response;
  }

  if (!isProtectedPage(pathname)) {
    return response;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && isProtectedPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
