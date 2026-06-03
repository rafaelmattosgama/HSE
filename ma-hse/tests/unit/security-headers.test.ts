import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

function headerValue(name: string) {
  return securityHeaders.find((header) => header.key.toLowerCase() === name.toLowerCase())?.value;
}

describe("security headers", () => {
  it("sets clickjacking and baseline browser hardening headers", () => {
    expect(headerValue("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("keeps required CSP directives", () => {
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("base-uri 'self'");
    expect(contentSecurityPolicy).toContain("form-action 'self'");
  });
});
