import { NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/lib/services/email-service";

export const NotificationService = {
  async notify(input: {
    plantId?: string;
    userIds?: string[];
    title: string;
    body: string;
    emailTo?: string[];
  }) {
    if (input.userIds?.length) {
      await prisma.notification.createMany({
        data: input.userIds.map((userId) => ({
          userId,
          plantId: input.plantId,
          title: input.title,
          body: input.body,
          status: NotificationStatus.UNREAD,
        })),
      });
    }

    if (input.emailTo?.length) {
      await EmailService.sendMail({
        to: input.emailTo,
        subject: input.title,
        html: `<p>${input.body}</p>`,
      });
    }
  },
};