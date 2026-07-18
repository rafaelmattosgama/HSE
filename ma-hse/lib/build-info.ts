export type PublicBuildInfo =
  | { environment: "development"; commit: string }
  | { environment: "production"; version: string };

type ResolvePublicBuildInfoInput = {
  appEnvironment?: string;
  deployVersion?: string;
  gitCommit?: string;
  resolveGitCommit?: () => string | undefined;
  warn?: (message: string) => void;
};

function clean(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function shortCommit(value: string) {
  return value.slice(0, 7);
}

export function resolvePublicBuildInfo(input: ResolvePublicBuildInfoInput): PublicBuildInfo | null {
  if (input.appEnvironment === "production") {
    const version = clean(input.deployVersion);
    if (!version) {
      input.warn?.(
        "[build-info] APP_ENV=production but DEPLOY_VERSION is missing. The login page will remain available without displaying a version.",
      );
      return null;
    }

    return { environment: "production", version };
  }

  const commit = clean(input.gitCommit) ?? clean(input.resolveGitCommit?.());
  return commit ? { environment: "development", commit: shortCommit(commit) } : null;
}

export function parsePublicBuildInfo(value?: string): PublicBuildInfo | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<PublicBuildInfo>;
    if (parsed.environment === "development") {
      const commit = clean(parsed.commit);
      return commit ? { environment: "development", commit: shortCommit(commit) } : null;
    }
    if (parsed.environment === "production") {
      const version = clean(parsed.version);
      return version ? { environment: "production", version } : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function getPublicBuildInfoPresentation(info: PublicBuildInfo | null) {
  if (!info) return null;
  return info.environment === "production"
    ? { messageKey: "version" as const, value: info.version }
    : { messageKey: "commit" as const, value: info.commit };
}
