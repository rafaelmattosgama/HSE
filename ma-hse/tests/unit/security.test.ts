import { describe, expect, it } from "vitest";
import { hashAccessToken } from "@/lib/security";

describe("token security", () => {
  it("hashes deterministically", () => {
    const a = hashAccessToken("sample-token");
    const b = hashAccessToken("sample-token");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes hash when token changes", () => {
    const a = hashAccessToken("sample-token");
    const b = hashAccessToken("other-token");
    expect(a).not.toBe(b);
  });
});