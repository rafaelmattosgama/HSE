// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateActionQuick } from "@/components/feature/create-action-quick";

const navigationMock = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMock);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("CreateActionQuick", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    navigationMock.usePathname.mockReturnValue("/app/maap/communications/comm-1");
    navigationMock.useRouter.mockReturnValue({ refresh });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows success feedback, resets editable fields and refreshes the page after creating a linked action", async () => {
    const request = deferred<{ ok: boolean; json: () => Promise<{ ok: boolean }> }>();
    vi.mocked(fetch).mockReturnValue(request.promise as never);

    const { container } = render(createElement(CreateActionQuick, {
      owners: [{ id: "owner-1", label: "Rafael Goncalves" }],
      communicationOptions: [],
      lockedCommunicationId: "comm-1",
      lockedCommunicationLabel: "Linked communication: comm-1",
    }));

    const titleInput = screen.getByPlaceholderText("Title") as HTMLInputElement;
    const descriptionInput = screen.getByPlaceholderText("Description") as HTMLTextAreaElement;
    const selects = container.querySelectorAll("select");
    const ownerSelect = selects[2] as HTMLSelectElement;
    const dueDateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const submitButton = screen.getByRole("button", { name: "Create action" }) as HTMLButtonElement;

    fireEvent.change(titleInput, { target: { value: "Nova acao" } });
    fireEvent.change(descriptionInput, { target: { value: "Descricao da nova acao." } });
    fireEvent.change(ownerSelect, { target: { value: "owner-1" } });
    fireEvent.change(dueDateInput, { target: { value: "2026-06-15" } });
    fireEvent.click(submitButton);

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toBe("Creating action...");

    request.resolve({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Action created successfully.")).toBeTruthy();
    expect(titleInput.value).toBe("");
    expect(descriptionInput.value).toBe("");
    expect(ownerSelect.value).toBe("");
    expect(dueDateInput.value).toBe("");
  });

  it("does not submit twice while the first creation request is pending", async () => {
    const request = deferred<{ ok: boolean; json: () => Promise<{ ok: boolean }> }>();
    vi.mocked(fetch).mockReturnValue(request.promise as never);

    const { container } = render(createElement(CreateActionQuick, {
      owners: [{ id: "owner-1", label: "Rafael Goncalves" }],
      communicationOptions: [],
      lockedCommunicationId: "comm-1",
      lockedCommunicationLabel: "Linked communication: comm-1",
    }));

    const titleInput = screen.getByPlaceholderText("Title") as HTMLInputElement;
    const descriptionInput = screen.getByPlaceholderText("Description") as HTMLTextAreaElement;
    const selects = container.querySelectorAll("select");
    const ownerSelect = selects[2] as HTMLSelectElement;
    const submitButton = screen.getByRole("button", { name: "Create action" }) as HTMLButtonElement;

    fireEvent.change(titleInput, { target: { value: "Nova acao" } });
    fireEvent.change(descriptionInput, { target: { value: "Descricao da nova acao." } });
    fireEvent.change(ownerSelect, { target: { value: "owner-1" } });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(fetch).toHaveBeenCalledTimes(1);

    request.resolve({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a clear message when an existing communication action is reused", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          idempotency: {
            reusedExistingAction: true,
          },
        },
      }),
    } as never);

    const { container } = render(createElement(CreateActionQuick, {
      owners: [{ id: "owner-1", label: "Rafael Goncalves" }],
      communicationOptions: [],
      lockedCommunicationId: "comm-1",
      lockedCommunicationLabel: "Linked communication: comm-1",
    }));

    const titleInput = screen.getByPlaceholderText("Title") as HTMLInputElement;
    const descriptionInput = screen.getByPlaceholderText("Description") as HTMLTextAreaElement;
    const selects = container.querySelectorAll("select");
    const ownerSelect = selects[2] as HTMLSelectElement;
    const submitButton = screen.getByRole("button", { name: "Create action" });

    fireEvent.change(titleInput, { target: { value: "Nova acao" } });
    fireEvent.change(descriptionInput, { target: { value: "Descricao da nova acao." } });
    fireEvent.change(ownerSelect, { target: { value: "owner-1" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("An open action already exists for this communication.")).toBeTruthy();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the entered data and shows an error message when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, message: "Unable to create action right now." }),
    } as never);

    const { container } = render(createElement(CreateActionQuick, {
      owners: [{ id: "owner-1", label: "Rafael Goncalves" }],
      communicationOptions: [],
      lockedCommunicationId: "comm-1",
      lockedCommunicationLabel: "Linked communication: comm-1",
    }));

    const titleInput = screen.getByPlaceholderText("Title") as HTMLInputElement;
    const descriptionInput = screen.getByPlaceholderText("Description") as HTMLTextAreaElement;
    const selects = container.querySelectorAll("select");
    const ownerSelect = selects[2] as HTMLSelectElement;
    const submitButton = screen.getByRole("button", { name: "Create action" });

    fireEvent.change(titleInput, { target: { value: "Nova acao" } });
    fireEvent.change(descriptionInput, { target: { value: "Descricao da nova acao." } });
    fireEvent.change(ownerSelect, { target: { value: "owner-1" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Unable to create action right now.")).toBeTruthy();
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(titleInput.value).toBe("Nova acao");
    expect(descriptionInput.value).toBe("Descricao da nova acao.");
    expect(ownerSelect.value).toBe("owner-1");
  });
});
