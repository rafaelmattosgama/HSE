// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateSmatAudit } from "@/components/feature/create-smat-audit";

describe("CreateSmatAudit attachments", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:smat-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows selected files with preview, caption field, and removal", () => {
    render(createElement(CreateSmatAudit, { plantCode: "pl1", auditorName: "Ana Silva", owners: [] }));

    const file = new File(["photo"], "smat-photo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Adicionar ficheiros"), { target: { files: [file] } });

    expect(screen.getByText("smat-photo.jpg")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Previsualizacao de smat-photo.jpg" })).toBeTruthy();

    const captionInput = screen.getByPlaceholderText("Legenda opcional") as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: "Guarda removida temporariamente" } });
    expect(captionInput.value).toBe("Guarda removida temporariamente");

    fireEvent.click(screen.getAllByRole("button", { name: "Remover" }).at(-1)!);

    expect(screen.queryByText("smat-photo.jpg")).toBeNull();
    expect(screen.getByText("Sem ficheiros selecionados.")).toBeTruthy();
  });

  it("uploads files and sends captions with the SMAT payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url === "/api/storage/presign") {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            uploadUrl: "http://storage.local/upload",
            key: "pl1/smat/smat-photo.jpg",
          },
        }), { status: 200 });
      }

      if (url === "http://storage.local/upload") {
        return new Response(null, { status: 200 });
      }

      if (url === "/api/plants/pl1/smat") {
        return new Response(JSON.stringify({ ok: false, message: "stop after payload" }), { status: 400 });
      }

      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    });

    render(createElement(CreateSmatAudit, { plantCode: "pl1", auditorName: "Ana Silva", owners: [] }));

    fireEvent.change(screen.getByLabelText("Adicionar ficheiros"), {
      target: {
        files: [new File(["photo"], "smat-photo.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.change(screen.getByPlaceholderText("Legenda opcional"), {
      target: { value: "Condicao observada na linha 1" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Gravar auditoria" })[0]);

    await waitFor(() => {
      expect(screen.getByText("stop after payload")).toBeTruthy();
    });

    const smatCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/plants/pl1/smat");
    expect(smatCall).toBeTruthy();

    const body = JSON.parse((smatCall?.[1] as RequestInit).body as string);
    expect(body.attachments).toEqual([
      expect.objectContaining({
        fileKey: "pl1/smat/smat-photo.jpg",
        fileName: "smat-photo.jpg",
        contentType: "image/jpeg",
        caption: "Condicao observada na linha 1",
        size: 5,
      }),
    ]);
  });
});
