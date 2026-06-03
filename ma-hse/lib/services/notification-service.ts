import { NotificationStatus, RoleCode } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

export const NotificationService = {
  async notify(input: {
    plantId?: string;
    userIds?: string[];
    title: string;
    body: string;
    html?: string;
    channel?: string;
    emailTo?: string[];
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }) {
    if (input.userIds?.length) {
      await prisma.notification.createMany({
        data: input.userIds.map((userId) => ({
          userId,
          plantId: input.plantId,
          title: input.title,
          body: input.body,
          channel: input.channel ?? "DASHBOARD",
          status: NotificationStatus.UNREAD,
        })),
      });
    }

    if (input.emailTo?.length) {
      try {
        await sendNotificationEmail({
          to: input.emailTo,
          tituloNotificacao: input.title,
          mensagem: input.body,
          dataHora: new Date(),
          plantName: input.plantId ?? "-",
          attachments: input.attachments,
        });
      } catch (error) {
        logger.error(
          {
            errorName: error instanceof Error ? error.name : "UnknownError",
            plantId: input.plantId,
            channel: input.channel,
            recipientCount: input.emailTo.length,
          },
          "notification_email_send_failed_non_blocking",
        );
      }
    }
  },

  async notifyPlantRoles(input: {
    plantId: string;
    roles: RoleCode[];
    title: string;
    body: string;
    channel?: string;
  }) {
    const recipients = await prisma.userPlantRole.findMany({
      where: {
        plantId: input.plantId,
        role: {
          code: {
            in: input.roles,
          },
        },
        user: {
          isActive: true,
        },
      },
      include: {
        user: true,
      },
    });

    const userIds = recipients.map((entry) => entry.userId);
    const emails = recipients.flatMap((entry) => (entry.user.email ? [entry.user.email] : []));

    if (!userIds.length && !emails.length) {
      return;
    }

    await this.notify({
      plantId: input.plantId,
      userIds,
      emailTo: emails,
      title: input.title,
      body: input.body,
      channel: input.channel,
    });
  },
};
