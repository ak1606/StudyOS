import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware: protect /dashboard/* routes.
 *
 * Checks for the `lms-auth` localStorage-persisted Zustand store.
 * Since middleware runs on the edge (no localStorage), we check for
 * a cookie or rely on client-side redirect.  Here we use a lightweight
 * approach: if the request has no auth cookie / header we redirect.
 *
 * In practice the Zustand persist store writes to localStorage, which
 * can't be read in edge middleware.  So we set a thin `lms-session`
 * cookie from the client when logging in, and check it here.
 *
 * Fallback: if no cookie, let the page load and the client-side
 * AuthGuard component will redirect.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Check for session indicator cookie
  const hasSession = request.cookies.get("lms-session");
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
