import { afterEach, describe, expect, it } from "vitest";
import {
  buildCredentialsRateLimitKeys,
  enforceCredentialsLoginRateLimit,
  readCredentialsEmail,
  recordFailedCredentialsLogin,
  validateAuthPostOrigin,
} from "@/lib/auth/hardening";
import { resetRateLimit } from "@/lib/rate-limit";

function credentialsRequest(ip: string, email: string, origin = "https://maxsafety.maportugal.com") {
  return new Request("https://maxsafety.maportugal.com/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "maxsafety.maportugal.com",
      origin,
      "user-agent": "vitest",
      "x-forwarded-for": ip,
      "x-forwarded-proto": "https",
    },
    body: new URLSearchParams({
      email,
      password: "not-logged",
      csrfToken: "not-logged",
    }),
  });
}

async function resetRequestKeys(request: Request, email: string | null) {
  await Promise.all(buildCredentialsRateLimitKeys(request.headers, email).map((key) => resetRateLimit(key)));
}

describe("auth hardening", () => {
  afterEach(async () => {
    const request = credentialsRequest("203.0.113.10", "blocked@example.com");
    await resetRequestKeys(request, "blocked@example.com");
  });

  it("rejects cross-origin auth POST requests", async () => {
    const request = credentialsRequest("203.0.113.20", "user@example.com", "https://evil.example");
    const response = validateAuthPostOrigin(request);

    expect(response?.status).toBe(403);
  });

  it("allows same-origin auth POST requests", () => {
    const request = credentialsRequest("203.0.113.21", "user@example.com");

    expect(validateAuthPostOrigin(request)).toBeNull();
  });

  it("reads credential email without consuming the original request", async () => {
    const request = credentialsRequest("203.0.113.22", "USER@Example.COM");

    await expect(readCredentialsEmail(request)).resolves.toBe("user@example.com");
    await expect(request.formData()).resolves.toBeInstanceOf(FormData);
  });

  it("returns 429 after repeated failed credentials attempts", async () => {
    const request = credentialsRequest("203.0.113.10", "blocked@example.com");
    const email = await readCredentialsEmail(request);
    await resetRequestKeys(request, email);

    for (let index = 0; index < 5; index += 1) {
      await recordFailedCredentialsLogin(request.headers, email, "invalid_password");
    }

    const response = await enforceCredentialsLoginRateLimit(request);

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
