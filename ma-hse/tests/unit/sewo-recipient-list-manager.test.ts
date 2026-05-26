// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";

const labels = getStaticN0MasterDataUi("en");

function buildResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SewoRecipientListManager", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a new recipient with the expected payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          recipient: {
            id: "recipient-1",
            name: "Maria Silva",
            email: "maria.silva@example.com",
            language: "pt",
          },
        },
      }, 201),
    );

    render(createElement(SewoRecipientListManager, {
      plantCode: "pl1",
      initialRecipients: [],
      labels,
    }));

    fireEvent.change(screen.getByPlaceholderText("Maria Silva"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByPlaceholderText("maria.silva@example.com"), { target: { value: "Maria.Silva@example.com" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pt" } });
    fireEvent.click(screen.getByRole("button", { name: "Add recipient" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/plants/pl1/admin/sewo-report-recipients");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Maria Silva",
      email: "Maria.Silva@example.com",
      language: "pt",
    });
    expect(await screen.findByText("Recipient created successfully.")).toBeTruthy();
  });

  it("edits and removes an existing recipient", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildResponse({
          ok: true,
          data: {
            recipient: {
              id: "recipient-1",
              name: "Maria Silva",
              email: "maria@example.com",
              language: "en",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        buildResponse({
          ok: true,
          data: {
            recipientId: "recipient-1",
          },
        }),
      );

    render(createElement(SewoRecipientListManager, {
      plantCode: "pl1",
      initialRecipients: [
        {
          id: "recipient-1",
          name: "Maria",
          email: "maria@example.com",
          language: "pt",
        },
      ],
      labels,
    }));

    const recipientCard = screen.getByText("Maria").closest("article");
    if (!recipientCard) {
      throw new Error("Recipient card not found");
    }

    fireEvent.click(within(recipientCard).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Maria Silva"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: "recipient-1",
      name: "Maria Silva",
      email: "maria@example.com",
      language: "en",
    });
    expect(await screen.findByText("Recipient updated successfully.")).toBeTruthy();

    const updatedCard = screen.getByText("Maria Silva").closest("article");
    if (!updatedCard) {
      throw new Error("Updated recipient card not found");
    }

    fireEvent.click(within(updatedCard).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      id: "recipient-1",
    });
    expect(await screen.findByText("Recipient removed successfully.")).toBeTruthy();
  });

  it("shows a friendly fallback message when the API returns an empty response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 500,
      }),
    );

    render(createElement(SewoRecipientListManager, {
      plantCode: "pl1",
      initialRecipients: [],
      labels,
    }));

    fireEvent.change(screen.getByPlaceholderText("Maria Silva"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByPlaceholderText("maria.silva@example.com"), { target: { value: "maria@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add recipient" }));

    expect(await screen.findByText(labels.sewoRecipients.saveError)).toBeTruthy();
  });
});
