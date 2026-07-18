import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getPublicBuildInfoPresentation,
  parsePublicBuildInfo,
  resolvePublicBuildInfo,
} from "@/lib/build-info";

describe("login build information", () => {
  it("uses the short Git commit in development and ignores the deploy version", () => {
    expect(resolvePublicBuildInfo({
      appEnvironment: "development",
      deployVersion: "9.9.9",
      gitCommit: "a4c821f123456789",
    })).toEqual({ environment: "development", commit: "a4c821f" });
  });

  it("resolves the local Git commit with the existing fallback when no variable is provided", () => {
    const resolveGitCommit = vi.fn(() => "7654321");

    expect(resolvePublicBuildInfo({
      appEnvironment: "development",
      resolveGitCommit,
    })).toEqual({ environment: "development", commit: "7654321" });
    expect(resolveGitCommit).toHaveBeenCalledOnce();
  });

  it("returns only DEPLOY_VERSION in production and never resolves or serializes the commit", () => {
    const resolveGitCommit = vi.fn(() => "secret-commit");
    const info = resolvePublicBuildInfo({
      appEnvironment: "production",
      deployVersion: "Release 2026.07",
      gitCommit: "secret-commit",
      resolveGitCommit,
    });

    expect(info).toEqual({ environment: "production", version: "Release 2026.07" });
    expect(resolveGitCommit).not.toHaveBeenCalled();
    expect(JSON.stringify(info)).not.toContain("commit");
    expect(JSON.stringify(info)).not.toContain("secret-commit");
  });

  it("does not render N/A when the local commit is unavailable", () => {
    const info = resolvePublicBuildInfo({
      appEnvironment: "development",
      resolveGitCommit: () => undefined,
    });

    expect(info).toBeNull();
    expect(getPublicBuildInfoPresentation(info)).toBeNull();
    expect(JSON.stringify(info)).not.toContain("N/A");
  });

  it("warns but keeps the login build information optional when DEPLOY_VERSION is missing", () => {
    const warn = vi.fn();

    expect(resolvePublicBuildInfo({ appEnvironment: "production", warn })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DEPLOY_VERSION is missing"));
  });

  it("updates the public value whenever a new deploy version is built", () => {
    const first = resolvePublicBuildInfo({ appEnvironment: "production", deployVersion: "2.4.0" });
    const second = resolvePublicBuildInfo({ appEnvironment: "production", deployVersion: "2.4.1" });

    expect(first).not.toEqual(second);
    expect(getPublicBuildInfoPresentation(second)).toEqual({ messageKey: "version", value: "2.4.1" });
  });

  it("uses APP_ENV only and does not inspect a hostname", () => {
    expect(resolvePublicBuildInfo({
      appEnvironment: "production",
      deployVersion: "Production 3.1",
    })).toEqual({ environment: "production", version: "Production 3.1" });
    expect(resolvePublicBuildInfo({
      appEnvironment: "development",
      gitCommit: "abcdef1",
    })).toEqual({ environment: "development", commit: "abcdef1" });
  });

  it("rejects invalid, empty or mixed public payloads safely", () => {
    expect(parsePublicBuildInfo(undefined)).toBeNull();
    expect(parsePublicBuildInfo("not-json")).toBeNull();
    expect(parsePublicBuildInfo(JSON.stringify({ environment: "production", version: "" }))).toBeNull();
    expect(parsePublicBuildInfo(JSON.stringify({
      environment: "production",
      version: "2.4.0",
      commit: "must-not-be-used",
    }))).toEqual({ environment: "production", version: "2.4.0" });
  });

  it("defines localized Commit and Version labels for every supported language", () => {
    const expected = {
      en: ["Commit: {value}", "Version: {value}"],
      it: ["Commit: {value}", "Versione: {value}"],
      pt: ["Commit: {value}", "Versão: {value}"],
      pl: ["Commit: {value}", "Wersja: {value}"],
      de: ["Commit: {value}", "Version: {value}"],
      ro: ["Commit: {value}", "Versiune: {value}"],
      fr: ["Commit: {value}", "Version : {value}"],
    } as const;

    for (const [locale, labels] of Object.entries(expected)) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as { buildInfo: { commit: string; version: string } };
      expect([messages.buildInfo.commit, messages.buildInfo.version]).toEqual(labels);
    }
  });
});
