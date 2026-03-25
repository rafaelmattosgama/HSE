import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth/options";

describe("auth configuration", () => {
  it("supports credentials and email providers", () => {
    const ids = authOptions.providers?.map((provider) => provider.id) ?? [];
    expect(ids).toContain("credentials");
    expect(ids).toContain("email");
  });

  it("uses custom login page", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
  });
});