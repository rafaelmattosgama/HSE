import { describe, expect, it } from "vitest";
import { assertDemoModeSafe, getDemoScriptForEmail, DEMO_ACCOUNTS } from "@/lib/demo-mode";

const ok = { DEMO_MODE: true, APP_ENV: "development", DATABASE_URL: "postgresql://ehs:ehs@localhost:5434/ehs_demo" };

describe("assertDemoModeSafe", () => {
  it("accepts the local demo database", () => {
    expect(() => assertDemoModeSafe(ok)).not.toThrow();
    expect(() => assertDemoModeSafe({ ...ok, DATABASE_URL: "postgresql://ehs:ehs@127.0.0.1:5434/ehs_demo?schema=public" })).not.toThrow();
  });

  it("does nothing when demo mode is off", () => {
    expect(() => assertDemoModeSafe({ DEMO_MODE: false, APP_ENV: "production", DATABASE_URL: "postgresql://x@postgres:5432/ehs" })).not.toThrow();
  });

  it("refuses production, another database or a remote host", () => {
    expect(() => assertDemoModeSafe({ ...ok, APP_ENV: "production" })).toThrow(/produção/);
    expect(() => assertDemoModeSafe({ ...ok, DATABASE_URL: "postgresql://ehs:ehs@localhost:5433/ehs" })).toThrow(/ehs_demo/);
    expect(() => assertDemoModeSafe({ ...ok, DATABASE_URL: "postgresql://ehs:ehs@postgres:5432/ehs_demo" })).toThrow(/local/);
    expect(() => assertDemoModeSafe({ ...ok, DATABASE_URL: "not a url" })).toThrow();
  });
});

describe("demo accounts", () => {
  it("maps each demo account to its script, case-insensitively", () => {
    expect(getDemoScriptForEmail("DEMO.Seguranca@maxsafety.demo")).toBe("demo-training-n3");
    expect(getDemoScriptForEmail("demo.apresentacao@maxsafety.demo")).toBe("demo-presentation");
    expect(getDemoScriptForEmail("someone@real.com")).toBeNull();
    expect(new Set(DEMO_ACCOUNTS.map((account) => account.script)).size).toBe(4);
  });
});
