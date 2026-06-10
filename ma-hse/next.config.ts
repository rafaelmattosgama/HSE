import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { securityHeaders } from "./lib/security-headers";

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
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit"],
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: resolveBuildCommit(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = config.externals ?? [];
      config.externals.push({ pdfkit: "commonjs pdfkit" });
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
