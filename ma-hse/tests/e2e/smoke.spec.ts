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
