// @vitest-environment jsdom

import { createElement, type ComponentType, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { LoginBuildInfo } from "@/components/auth/login-build-info";
import type { PublicBuildInfo } from "@/lib/build-info";

function renderBuildInfo(locale: string, messages: { commit: string; version: string }, info: PublicBuildInfo | null) {
  const IntlProvider = NextIntlClientProvider as ComponentType<{
    locale: string;
    messages: { buildInfo: { commit: string; version: string } };
    children?: ReactNode;
  }>;

  return render(
    createElement(
      IntlProvider,
      { locale, messages: { buildInfo: messages } },
      createElement(LoginBuildInfo, { info }),
    ),
  );
}

describe("LoginBuildInfo", () => {
  afterEach(cleanup);

  it("shows only the commit in development", () => {
    renderBuildInfo("en", { commit: "Commit: {value}", version: "Version: {value}" }, {
      environment: "development",
      commit: "a4c821f",
    });

    expect(screen.getByText("Commit: a4c821f")).toBeTruthy();
    expect(screen.queryByText(/Version:/)).toBeNull();
  });

  it("shows only the localized deploy version in production", () => {
    renderBuildInfo("pt", { commit: "Commit: {value}", version: "Versão: {value}" }, {
      environment: "production",
      version: "Produção 3.1",
    });

    expect(screen.getByText("Versão: Produção 3.1")).toBeTruthy();
    expect(screen.queryByText(/Commit:/)).toBeNull();
  });

  it("renders nothing when build information is unavailable", () => {
    const view = renderBuildInfo("en", { commit: "Commit: {value}", version: "Version: {value}" }, null);

    expect(view.container.textContent).toBe("");
    expect(view.container.textContent).not.toContain("N/A");
  });
});
