import { NotificationStatus, RoleCode, SafetyCommunicationNotificationDeliveryStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

const PROFILE_ALERT_ROLES = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR] as const;

export type ProfileAlertRow = {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  status: NotificationStatus;
};

type SessionUser = Session["user"];
type WritableNotificationStatus = "READ" | "UNREAD";

function getProfileAlertPlantIds(user: SessionUser) {
  return user.plantRoles
    .filter((entry) => PROFILE_ALERT_ROLES.includes(entry.role as (typeof PROFILE_ALERT_ROLES)[number]))
    .map((entry) => entry.plantId)
    .filter((plantId): plantId is string => Boolean(plantId));
}

function hasProfileAlertRole(user: SessionUser) {
  return user.plantRoles.some((entry) =>
    PROFILE_ALERT_ROLES.includes(entry.role as (typeof PROFILE_ALERT_ROLES)[number]),
  );
}

function buildUserAlertWhere(user: SessionUser) {
  if (!hasProfileAlertRole(user)) {
    return null;
  }

  const plantIds = getProfileAlertPlantIds(user);

  return {
    userId: user.id,
    ...(plantIds.length
      ? {
          OR: [
            {
              plantId: {
                in: plantIds,
              },
            },
            {
              plantId: null,
            },
          ],
        }
      : {}),
  };
}

export const ProfileAlertService = {
  canUseAlerts(user: SessionUser) {
    return hasProfileAlertRole(user);
  },

  getScopeLabel(user: SessionUser) {
    const roleLabels = new Set(
      user.plantRoles
        .filter((entry) => PROFILE_ALERT_ROLES.includes(entry.role as (typeof PROFILE_ALERT_ROLES)[number]))
        .map((entry) => (entry.role === RoleCode.N4_SUPERVISOR ? "N4" : "N3")),
    );

    return Array.from(roleLabels).sort().join("/") || "";
  },

  async listForUser(user: SessionUser): Promise<ProfileAlertRow[]> {
    const where = buildUserAlertWhere(user);
    if (!where) return [];

    const rows = await prisma.notification.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        title: true,
        body: true,
        status: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      title: row.title,
      body: row.body,
      status: row.status,
    }));
  },

  async countUnreadForUser(user: SessionUser) {
    const where = buildUserAlertWhere(user);
    if (!where) return 0;

    return prisma.notification.count({
      where: {
        ...where,
        status: NotificationStatus.UNREAD,
      },
    });
  },

  async updateStatusForUser(input: {
    user: SessionUser;
    notificationIds: string[];
    status: WritableNotificationStatus;
  }) {
    const where = buildUserAlertWhere(input.user);
    if (!where) {
      return {
        updated: 0,
        unreadCount: 0,
      };
    }

    const readAt = input.status === NotificationStatus.READ ? new Date() : null;
    const matchingNotifications = await prisma.notification.findMany({
      where: {
        ...where,
        id: {
          in: input.notificationIds,
        },
      },
      select: {
        id: true,
      },
    });
    const notificationIds = matchingNotifications.map((notification) => notification.id);

    if (!notificationIds.length) {
      return {
        updated: 0,
        unreadCount: await this.countUnreadForUser(input.user),
      };
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: {
          in: notificationIds,
        },
      },
      data: {
        status: input.status,
        readAt,
      },
    });

    await prisma.safetyCommunicationNotification.updateMany({
      where: {
        notificationId: {
          in: notificationIds,
        },
      },
      data: {
        status: input.status === NotificationStatus.READ
          ? SafetyCommunicationNotificationDeliveryStatus.READ
          : SafetyCommunicationNotificationDeliveryStatus.SENT,
        readAt,
      },
    });

    return {
      updated: result.count,
      unreadCount: await this.countUnreadForUser(input.user),
    };
  },
};
