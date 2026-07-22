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
      "cross-env ALLOW_DEV_DEFAULT_ENV=true NEXTAUTH_URL=http://127.0.0.1:3210 APP_URL=http://127.0.0.1:3210 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3210 REDIS_URL=redis://127.0.0.1:6380 S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1 S3_ACCESS_KEY=minio S3_SECRET_KEY=minio123 S3_BUCKET=ehs-attachments S3_FORCE_PATH_STYLE=true SMTP_HOST=127.0.0.1 SMTP_PORT=1025 TOKEN_PEPPER=dev-pepper-1234567890123456 node scripts/prepare-e2e.mjs && cross-env ALLOW_DEV_DEFAULT_ENV=true NEXTAUTH_URL=http://127.0.0.1:3210 APP_URL=http://127.0.0.1:3210 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3210 REDIS_URL=redis://127.0.0.1:6380 S3_ENDPOINT=http://127.0.0.1:9000 S3_REGION=us-east-1 S3_ACCESS_KEY=minio S3_SECRET_KEY=minio123 S3_BUCKET=ehs-attachments S3_FORCE_PATH_STYLE=true SMTP_HOST=127.0.0.1 SMTP_PORT=1025 TOKEN_PEPPER=dev-pepper-1234567890123456 npm run start -- --port 3210 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
