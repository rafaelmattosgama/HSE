import { NotificationStatus, RoleCode } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { buildPlantRoleScope } from "@/lib/rbac/user-management";
import { sendNotificationEmail } from "@/src/email/systemEmailHelpers.js";

type EmailRecipient = {
  email: string;
  name?: string | null;
  language?: string | null;
};

export const NotificationService = {
  async notify(input: {
    plantId?: string;
    userIds?: string[];
    title: string;
    body: string;
    html?: string;
    channel?: string;
    emailTo?: string[];
    emailRecipients?: EmailRecipient[];
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

    const emailRecipients: EmailRecipient[] = input.emailRecipients?.length
      ? input.emailRecipients
      : input.emailTo?.map((email) => ({ email })) ?? [];

    if (emailRecipients.length) {
      await Promise.allSettled(
        emailRecipients.map(async (recipient) => {
          try {
            await sendNotificationEmail({
              user: {
                email: recipient.email,
                name: recipient.name ?? undefined,
                language: recipient.language ?? undefined,
              },
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
              },
              "notification_email_send_failed_non_blocking",
            );
          }
        }),
      );
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
        ...buildPlantRoleScope(input.plantId, input.roles),
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
    const emailRecipients = recipients.flatMap((entry) =>
      entry.user.email
        ? [{
            email: entry.user.email,
            name: entry.user.name,
            language: entry.user.language,
          }]
        : [],
    );

    if (!userIds.length && !emailRecipients.length) {
      return;
    }

    await this.notify({
      plantId: input.plantId,
      userIds,
      emailRecipients,
      title: input.title,
      body: input.body,
      channel: input.channel,
    });
  },
};
