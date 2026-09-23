import { NextResponse, type NextRequest } from "next/server";
import { MODULE_REQUEST_PATH_HEADER } from "@/lib/role-modules";

// Forward the actual request path, replacing any client-supplied value.
// Authorization remains in the server template and API guards.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(MODULE_REQUEST_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/app/:path*", "/api/plants/:path*"] };
