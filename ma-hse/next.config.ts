import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { resolvePublicBuildInfo } from "./lib/build-info";
import { securityHeaders } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

function resolveGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const publicBuildInfo = resolvePublicBuildInfo({
  appEnvironment: process.env.APP_ENV,
  deployVersion: process.env.DEPLOY_VERSION,
  gitCommit:
    process.env.NEXT_PUBLIC_BUILD_COMMIT
    ?? process.env.NEXT_PUBLIC_GIT_COMMIT
    ?? process.env.GIT_COMMIT
    ?? process.env.VERCEL_GIT_COMMIT_SHA,
  resolveGitCommit,
  warn: console.warn,
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfkit"],
  env: {
    NEXT_PUBLIC_LOGIN_BUILD_INFO: JSON.stringify(publicBuildInfo),
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
