import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { execSync } from "node:child_process";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

function resolveBuildCommit() {
  const explicitCommit =
    process.env.NEXT_PUBLIC_BUILD_COMMIT ??
    process.env.NEXT_PUBLIC_GIT_COMMIT ??
    process.env.GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA;

  if (explicitCommit?.trim()) {
    return explicitCommit.trim();
  }

  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "N/A";
  } catch {
    return "N/A";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: resolveBuildCommit(),
  },
};

export default withNextIntl(nextConfig);
