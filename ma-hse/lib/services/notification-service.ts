import { NotificationStatus, RoleCode } from "@prisma/client";
import type { AppLocale } from "@/lib/i18n/routing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { buildPlantRoleScope } from "@/lib/rbac/user-management";
import { normalizeUiLocale } from "@/lib/ui-language";
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
    localizedContent?: Partial<Record<AppLocale, { title: string; body: string }>>;
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

    const uniqueRecipients = Array.from(
      new Map(recipients.map((entry) => [entry.userId, entry])).values(),
    );
    const userIds = uniqueRecipients.map((entry) => entry.userId);
    const emailRecipients = uniqueRecipients.flatMap((entry) =>
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

    if (input.localizedContent) {
      const recipientsByLocale = new Map<AppLocale, typeof uniqueRecipients>();
      for (const recipient of uniqueRecipients) {
        const locale = normalizeUiLocale(recipient.user.language) as AppLocale;
        recipientsByLocale.set(locale, [...(recipientsByLocale.get(locale) ?? []), recipient]);
      }
      await Promise.all(
        Array.from(recipientsByLocale.entries()).map(([locale, localeRecipients]) => {
          const content = input.localizedContent?.[locale] ?? { title: input.title, body: input.body };
          return this.notify({
            plantId: input.plantId,
            userIds: localeRecipients.map((entry) => entry.userId),
            emailRecipients: localeRecipients.flatMap((entry) => entry.user.email
              ? [{ email: entry.user.email, name: entry.user.name, language: entry.user.language }]
              : []),
            title: content.title,
            body: content.body,
            channel: input.channel,
          });
        }),
      );
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
