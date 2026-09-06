import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Gates the studio. Everything except /login and the auth endpoints requires
 * a valid session cookie.
 */
export async function middleware(request: NextRequest) {
  const user = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;

  if (pathname === "/login") {
    if (user) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static assets, and the auth routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
