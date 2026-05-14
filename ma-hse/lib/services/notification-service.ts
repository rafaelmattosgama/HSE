import { NotificationStatus, RoleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/lib/services/email-service";

export const NotificationService = {
  async notify(input: {
    plantId?: string;
    userIds?: string[];
    title: string;
    body: string;
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
      await EmailService.sendMail({
        to: input.emailTo,
        subject: input.title,
        html: `<p>${input.body}</p>`,
        text: input.body,
        attachments: input.attachments,
      });
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
