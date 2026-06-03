import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { consumeRateLimit, getRateLimitState, resetRateLimit } from "@/lib/rate-limit";
import { hashSensitiveValue } from "@/lib/security";

type HeaderInput = Headers | Record<string, string | string[] | undefined>;

export type AuthRequestMetadata = {
  ip: string;
  userAgent: string | null;
  origin: string | null;
  referer: string | null;
};

function getHeader(headers: HeaderInput, name: string) {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const value = headers[name] ?? headers[lowerName];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function getAuthRequestMetadata(headers: HeaderInput): AuthRequestMetadata {
  const ip =
    firstForwardedIp(getHeader(headers, "x-forwarded-for")) ??
    getHeader(headers, "x-real-ip") ??
    getHeader(headers, "cf-connecting-ip") ??
    "unknown";

  return {
    ip,
    userAgent: getHeader(headers, "user-agent"),
    origin: getHeader(headers, "origin"),
    referer: getHeader(headers, "referer"),
  };
}

export function normalizeLoginIdentifier(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function buildCredentialsRateLimitKeys(headers: HeaderInput, email: string | null) {
  return buildCredentialsRateLimitDescriptors(headers, email).map((descriptor) => descriptor.key);
}

function buildCredentialsRateLimitDescriptors(headers: HeaderInput, email: string | null) {
  const metadata = getAuthRequestMetadata(headers);
  const ipHash = hashSensitiveValue(metadata.ip);
  const descriptors = [
    {
      key: `auth:credentials:ip:${ipHash}`,
      points: env.AUTH_LOGIN_RATE_LIMIT_POINTS,
      windowSec: env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC,
    },
    {
      key: `auth:credentials:burst:ip:${ipHash}`,
      points: env.AUTH_LOGIN_RATE_LIMIT_BURST,
      windowSec: 10,
    },
  ];

  if (email) {
    const emailHash = hashSensitiveValue(email);
    descriptors.push(
      {
        key: `auth:credentials:account:${emailHash}`,
        points: env.AUTH_LOGIN_RATE_LIMIT_POINTS,
        windowSec: env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC,
      },
      {
        key: `auth:credentials:burst:account:${emailHash}`,
        points: env.AUTH_LOGIN_RATE_LIMIT_BURST,
        windowSec: 10,
      },
    );
  }

  return descriptors;
}

export async function getCredentialsLoginBlock(headers: HeaderInput, email: string | null) {
  const states = await Promise.all(
    buildCredentialsRateLimitDescriptors(headers, email).map((descriptor) =>
      getRateLimitState(descriptor.key, descriptor.points),
    ),
  );

  const blockedStates = states.filter((state) => !state.allowed);
  if (blockedStates.length === 0) {
    return null;
  }

  const resetAt = blockedStates.reduce<number | null>((current, state) => {
    if (!state.resetAt) return current;
    return current === null ? state.resetAt : Math.min(current, state.resetAt);
  }, null);

  return {
    retryAfter: resetAt ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC,
  };
}

export async function recordFailedCredentialsLogin(headers: HeaderInput, email: string | null, reason: string) {
  const metadata = getAuthRequestMetadata(headers);
  const emailHash = email ? hashSensitiveValue(email) : null;

  await Promise.all(
    buildCredentialsRateLimitDescriptors(headers, email).map((descriptor) =>
      consumeRateLimit(descriptor.key, descriptor.points, descriptor.windowSec),
    ),
  );

  logger.warn(
    {
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      origin: metadata.origin,
      emailHash,
      reason,
    },
    "login_attempt_failed",
  );
}

export async function resetCredentialsLoginLimit(headers: HeaderInput, email: string | null) {
  await Promise.all(buildCredentialsRateLimitKeys(headers, email).map((key) => resetRateLimit(key)));
}

function originFromUrl(value: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function configuredAllowedOrigins(request: Request) {
  const origins = new Set<string>();

  for (const value of [env.NEXTAUTH_URL, env.APP_URL, env.NEXT_PUBLIC_APP_URL]) {
    const origin = originFromUrl(value);
    if (origin) origins.add(origin);
  }

  const requestOrigin = originFromUrl(request.url);
  if (requestOrigin) origins.add(requestOrigin);

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (host) origins.add(`${proto}://${host}`);

  return origins;
}

export function validateAuthPostOrigin(request: Request) {
  if (request.method !== "POST") {
    return null;
  }

  const allowedOrigins = configuredAllowedOrigins(request);
  const origin = originFromUrl(request.headers.get("origin"));
  const referer = originFromUrl(request.headers.get("referer"));
  const observedOrigin = origin ?? referer;

  if (!observedOrigin) {
    logger.warn(getAuthRequestMetadata(request.headers), "auth_post_missing_origin");
    return null;
  }

  if (allowedOrigins.has(observedOrigin)) {
    return null;
  }

  logger.warn(
    {
      ...getAuthRequestMetadata(request.headers),
      observedOrigin,
    },
    "auth_post_cross_origin_blocked",
  );

  return NextResponse.json(
    {
      ok: false,
      errorCode: "INVALID_ORIGIN",
      message: "Invalid request origin",
    },
    { status: 403 },
  );
}

export async function readCredentialsEmail(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.clone().json();
      return normalizeLoginIdentifier(body?.email);
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.clone().formData();
      return normalizeLoginIdentifier(form.get("email"));
    }
  } catch {
    return null;
  }

  return null;
}

export function isCredentialsCallbackRequest(request: Request) {
  return request.method === "POST" && new URL(request.url).pathname.endsWith("/api/auth/callback/credentials");
}

export async function enforceCredentialsLoginRateLimit(request: Request) {
  if (!isCredentialsCallbackRequest(request)) {
    return null;
  }

  const email = await readCredentialsEmail(request);
  const blocked = await getCredentialsLoginBlock(request.headers, email);
  if (!blocked) {
    return null;
  }

  const metadata = getAuthRequestMetadata(request.headers);
  logger.warn(
    {
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      origin: metadata.origin,
      emailHash: email ? hashSensitiveValue(email) : null,
      retryAfter: blocked.retryAfter,
    },
    "login_rate_limited",
  );

  return NextResponse.json(
    {
      ok: false,
      errorCode: "RATE_LIMITED",
      message: "Too many login attempts. Try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(blocked.retryAfter),
      },
    },
  );
}
