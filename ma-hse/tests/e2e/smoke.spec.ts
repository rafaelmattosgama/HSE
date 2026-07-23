import "dotenv/config";
import { test, expect } from "@playwright/test";

test("login page smoke", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "MAx Safety - Integrated Safety Platform" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
});

test("public report page smoke", async ({ page }) => {
  await page.goto("/r/pl01/report?t=pl01-report-seed-token");
  await expect(page.getByRole("heading", { name: /Segnalazione di Sicurezza dello Stabilimento|Plant Safety Report/ })).toBeVisible();
  const communicationTypeLabels = await page.locator("#type option").allTextContents();
  expect(communicationTypeLabels.join(" ")).not.toMatch(/5S['’]s/i);
  expect(communicationTypeLabels.join(" ")).toMatch(/Miglioramento 5S|5S Improvement/);
  expect(communicationTypeLabels.join(" ")).toMatch(/Suggerimento di miglioramento|Improvement Suggestion/);
});

test("authenticated N0 module smoke", async ({ page }) => {
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const loginResponse = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: process.env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com",
      password: process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!",
      redirect: "false",
      json: "true",
    },
  });
  expect(loginResponse.ok()).toBe(true);

  const sessionResponse = await page.request.get("/api/auth/session");
  const session = (await sessionResponse.json()) as { user?: { email?: string } };
  expect(session.user?.email).toBe(process.env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com");

  const routes = [
    "/app/settings",
    "/app/corporate",
    "/app/pl01/dashboards",
    "/app/pl01/communications",
    "/app/pl01/actions",
    "/app/pl01/admin",
    "/app/pl01/occupational-health",
    "/app/pl01/sewo",
    "/app/pl01/smat",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should render successfully`).toBe(200);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  }
});
