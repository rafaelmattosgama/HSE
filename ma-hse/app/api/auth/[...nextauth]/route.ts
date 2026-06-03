import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { enforceCredentialsLoginRateLimit, validateAuthPostOrigin } from "@/lib/auth/hardening";
import { authOptions } from "@/lib/auth/options";

const handler = NextAuth(authOptions);
type RouteContext = { params: Promise<{ nextauth: string[] }> | { nextauth: string[] } };

export { handler as GET };

export async function POST(request: NextRequest, context: RouteContext) {
  const originFailure = validateAuthPostOrigin(request);
  if (originFailure) {
    return originFailure;
  }

  const rateLimitFailure = await enforceCredentialsLoginRateLimit(request);
  if (rateLimitFailure) {
    return rateLimitFailure;
  }

  return handler(request, context);
}
