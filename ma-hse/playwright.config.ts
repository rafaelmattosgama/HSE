import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "cross-env NEXTAUTH_URL=http://127.0.0.1:3210 APP_URL=http://127.0.0.1:3210 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3210 npm run start -- --port 3210 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
