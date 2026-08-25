import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  findPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    notification: {
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    safetyCommunicationNotification: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);

import { POST } from "@/app/api/plants/[plantCode]/notifications/acknowledge/route";

const notificationId = "11111111-1111-4111-8111-111111111111";

function routeContext(plantCode = "maap") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

function request(ids = [notificationId]) {
  return new Request("http://localhost/api/plants/maap/notifications/acknowledge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notificationIds: ids }),
  });
}

describe("notifications acknowledge route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns JSON when the plant does not exist", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
    });
    plantMock.findPlantByCode.mockResolvedValue(null);

    const response = await POST(request(), routeContext("missing"));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(json).toMatchObject({
      ok: false,
      errorCode: "PLANT_NOT_FOUND",
    });
  });

  it("treats already-read matching alerts as acknowledged", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
    });
    plantMock.findPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.prisma.notification.count.mockResolvedValue(1);

    const response = await POST(request(), routeContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: {
        updated: 0,
      },
    });
  });

  it("marks unread alerts as read for the current user and plant", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
    });
    plantMock.findPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.prisma.safetyCommunicationNotification.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), routeContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      data: {
        updated: 1,
      },
    });
    expect(prismaMock.prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [notificationId] },
          userId: "user-1",
          plantId: "plant-1",
          status: "UNREAD",
        }),
        data: expect.objectContaining({
          status: "READ",
        }),
      }),
    );
  });

  // (menor) COMPETENCE_ALERT (item 15's RepeatabilityAlertModal feed) and
  // COMPETENCE_URGENT (the suspend/revoke floating alert) must stay
  // acknowledgeable — dropping either from ACKNOWLEDGEABLE_CHANNELS would
  // leave the corresponding "Marcar como lido" a permanent 404 in production
  // without failing any other test in this file.
  it("acknowledges COMPETENCE_ALERT and COMPETENCE_URGENT notifications, not just the legacy channels", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
    });
    plantMock.findPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.prisma.safetyCommunicationNotification.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(), routeContext());

    expect(response.status).toBe(200);
    expect(prismaMock.prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: { in: expect.arrayContaining(["COMPETENCE_ALERT", "COMPETENCE_URGENT"]) },
        }),
      }),
    );
  });
});
