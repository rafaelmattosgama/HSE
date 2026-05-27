import {
  CommunicationStatus,
  NotificationStatus,
  RoleCode,
  SafetyCommunicationNotificationDeliveryStatus,
  SafetyCommunicationNotificationType,
} from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/lib/services/email-service";
import {
  formatSewoOccurrenceType,
  getSifPsifDisplayLabel,
  getSifPsifResultFromTemplateData,
} from "@/lib/services/sewo-validation-service";

export const SAFETY_COMMUNICATION_APPROVED_CHANNEL = "SAFETY_COMMUNICATION_APPROVED";

export class SafetyCommunicationAlertRecipientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SafetyCommunicationAlertRecipientError";
  }
}

export type SafetyCommunicationAlertRecipientRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyCommunicationAlertRecipientUserOption = {
  id: string;
  name: string;
  email: string | null;
};

export type SafetyCommunicationAlertRecipientDepartmentOption = {
  id: string;
  code: string;
  name: string;
};

export type SafetyCommunicationFloatingAlert = {
  id: string;
  communicationId: string;
  title: string;
  body: string;
  createdAt: string;
  actionUrl: string;
};

const SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE =
  "Safety communication alerts are temporarily unavailable because Prisma Client is outdated. Run `npm run db:generate` and restart or redeploy the application.";

type SafetyCommunicationAlertRecipientDelegate = {
  findMany: typeof prisma.safetyCommunicationAlertRecipient.findMany;
  findUnique: typeof prisma.safetyCommunicationAlertRecipient.findUnique;
  upsert: typeof prisma.safetyCommunicationAlertRecipient.upsert;
  updateMany: typeof prisma.safetyCommunicationAlertRecipient.updateMany;
};

type SafetyCommunicationNotificationDelegate = {
  findMany: typeof prisma.safetyCommunicationNotification.findMany;
  upsert: typeof prisma.safetyCommunicationNotification.upsert;
  update: typeof prisma.safetyCommunicationNotification.update;
};

function getSafetyCommunicationRuntimeClient() {
  return prisma as typeof prisma & {
    safetyCommunicationAlertRecipient?: SafetyCommunicationAlertRecipientDelegate;
    safetyCommunicationNotification?: SafetyCommunicationNotificationDelegate;
  };
}

function logMissingSafetyCommunicationDelegate(
  delegate: "safetyCommunicationAlertRecipient" | "safetyCommunicationNotification",
  context: string,
) {
  logger.error(
    {
      delegate,
      context,
    },
    "safety_communication_prisma_delegate_unavailable",
  );
}

function hasSafetyCommunicationAlertRecipientDelegate() {
  return Boolean(getSafetyCommunicationRuntimeClient().safetyCommunicationAlertRecipient);
}

function getSafetyCommunicationAlertRecipientDelegate(): SafetyCommunicationAlertRecipientDelegate;
function getSafetyCommunicationAlertRecipientDelegate(options: {
  allowMissing: true;
  context?: string;
}): SafetyCommunicationAlertRecipientDelegate | null;
function getSafetyCommunicationAlertRecipientDelegate(options?: {
  allowMissing?: boolean;
  context?: string;
}): SafetyCommunicationAlertRecipientDelegate | null {
  const delegate = getSafetyCommunicationRuntimeClient().safetyCommunicationAlertRecipient;
  if (!delegate) {
    if (options?.allowMissing) {
      logMissingSafetyCommunicationDelegate(
        "safetyCommunicationAlertRecipient",
        options.context ?? "unknown",
      );
      return null;
    }

    throw new SafetyCommunicationAlertRecipientError(
      "PRISMA_CLIENT_OUTDATED",
      SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE,
      503,
    );
  }

  return delegate;
}

function getSafetyCommunicationNotificationDelegate(): SafetyCommunicationNotificationDelegate;
function getSafetyCommunicationNotificationDelegate(options: {
  allowMissing: true;
  context?: string;
}): SafetyCommunicationNotificationDelegate | null;
function getSafetyCommunicationNotificationDelegate(options?: {
  allowMissing?: boolean;
  context?: string;
}): SafetyCommunicationNotificationDelegate | null {
  const delegate = getSafetyCommunicationRuntimeClient().safetyCommunicationNotification;
  if (!delegate) {
    if (options?.allowMissing) {
      logMissingSafetyCommunicationDelegate(
        "safetyCommunicationNotification",
        options.context ?? "unknown",
      );
      return null;
    }

    throw new SafetyCommunicationAlertRecipientError(
      "PRISMA_CLIENT_OUTDATED",
      SAFETY_COMMUNICATION_PRISMA_OUTDATED_MESSAGE,
      503,
    );
  }

  return delegate;
}

function formatDate(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 16);
}

function normalizeDepartmentValue(value: string) {
  return value.trim().toLowerCase();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCommunicationDetailPaths(input: {
  plantCode: string;
  communicationId: string;
}) {
  const relativePath = `/app/${input.plantCode}/communications/${input.communicationId}`;
  return {
    relativePath,
    absoluteUrl: new URL(relativePath, env.APP_URL).toString(),
  };
}

function buildApprovedAlertContent(input: {
  plantCode: string;
  communicationId: string;
  typeLabel: string;
  workstation: string;
  occurredAt: Date;
  workerName: string;
  sifPsifLabel: string;
  description: string;
}) {
  const { relativePath, absoluteUrl } = buildCommunicationDetailPaths({
    plantCode: input.plantCode,
    communicationId: input.communicationId,
  });
  const title = `Comunicacao de Seguranca - ${input.typeLabel}`;
  const escapedTitle = escapeHtml(title);
  const escapedTypeLabel = escapeHtml(input.typeLabel);
  const escapedWorkstation = escapeHtml(input.workstation);
  const escapedWorkerName = escapeHtml(input.workerName);
  const escapedSifPsifLabel = escapeHtml(input.sifPsifLabel);
  const escapedDescription = escapeHtml(input.description);
  const lines = [
    "A comunicacao foi aprovada pelo nivel N3.",
    `Tipo de ocorrencia: ${input.typeLabel}`,
    `Workstation: ${input.workstation}`,
    `Data: ${formatDate(input.occurredAt)}`,
    `Trabalhador envolvido: ${input.workerName}`,
    `SIF/PSIF: ${input.sifPsifLabel}`,
    `Descricao: ${input.description}`,
  ];
  const body = lines.join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#002663;">${escapedTitle}</h2>
      <p>A comunicacao foi aprovada pelo nivel N3.</p>
      <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:640px;">
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo de ocorrencia</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedTypeLabel}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Workstation</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedWorkstation}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Data</td><td style="padding:8px;border:1px solid #e2e8f0;">${formatDate(input.occurredAt)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Trabalhador envolvido</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedWorkerName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">SIF / PSIF</td><td style="padding:8px;border:1px solid #e2e8f0;">${escapedSifPsifLabel}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descricao</td><td style="padding:8px;border:1px solid #e2e8f0;white-space:pre-line;">${escapedDescription}</td></tr>
      </table>
      <p style="margin-top:16px;">
        <a href="${escapeHtml(absoluteUrl)}" style="display:inline-block;border-radius:8px;background:#0f766e;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:bold;">Abrir comunicacao</a>
      </p>
    </div>
  `;

  return {
    title,
    body,
    html,
    actionUrl: relativePath,
    absoluteUrl,
  };
}

async function resolveDepartmentByWorkerDept(input: {
  plantId: string;
  workerDept: string;
}) {
  const workerDept = input.workerDept.trim();
  if (!workerDept) {
    return null;
  }

  const normalized = normalizeDepartmentValue(workerDept);
  const departments = await prisma.area.findMany({
    where: {
      plantId: input.plantId,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  return departments.find((department) => {
    return normalizeDepartmentValue(department.code) === normalized
      || normalizeDepartmentValue(department.name) === normalized;
  }) ?? null;
}

async function loadApprovedCommunicationContext(communicationId: string) {
  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      plant: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      workstation: {
        select: {
          name: true,
        },
      },
      targetEmployee: {
        select: {
          id: true,
          name: true,
          employeeNo: true,
          dept: true,
        },
      },
      sewoRecords: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          templateData: true,
        },
      },
    },
  });

  if (!communication) {
    return null;
  }

  let targetEmployee = communication.targetEmployee;
  if (!targetEmployee && communication.targetEmployeeNo) {
    targetEmployee = await prisma.employeeDirectory.findUnique({
      where: {
        plantId_employeeNo: {
          plantId: communication.plantId,
          employeeNo: communication.targetEmployeeNo,
        },
      },
      select: {
        id: true,
        name: true,
        employeeNo: true,
        dept: true,
      },
    });
  }

  return {
    communication,
    targetEmployee,
    sewo: communication.sewoRecords[0] ?? null,
  };
}

async function sendEmailNotification(input: {
  plantId: string;
  communicationId: string;
  recipientUserId: string;
  recipientEmail: string | null;
  departmentId: string;
  title: string;
  body: string;
  html: string;
}) {
  const notificationModel = getSafetyCommunicationNotificationDelegate();
  const notification = await notificationModel.upsert({
    where: {
      communicationId_recipientUserId_notificationType: {
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
        notificationType: SafetyCommunicationNotificationType.EMAIL,
      },
    },
    create: {
      plantId: input.plantId,
      communicationId: input.communicationId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId,
      notificationType: SafetyCommunicationNotificationType.EMAIL,
      status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
    },
    update: {
      plantId: input.plantId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId,
      errorMessage: null,
    },
  });

  if (
    notification.status === SafetyCommunicationNotificationDeliveryStatus.SENT
    || notification.status === SafetyCommunicationNotificationDeliveryStatus.READ
  ) {
    return;
  }

  if (!input.recipientEmail?.trim()) {
    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: "Recipient user does not have an email configured.",
      },
    });
    return;
  }

  try {
    await EmailService.sendMail({
      to: input.recipientEmail,
      subject: input.title,
      html: input.html,
      text: input.body,
    });

    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await notificationModel.update({
      where: { id: notification.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown email delivery error",
      },
    });
    logger.error(
      {
        error,
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
      },
      "failed_to_send_safety_communication_email",
    );
  }
}

async function sendFloatingAlertNotification(input: {
  plantId: string;
  communicationId: string;
  recipientUserId: string;
  recipientEmail: string | null;
  departmentId: string;
  title: string;
  body: string;
}) {
  const notificationModel = getSafetyCommunicationNotificationDelegate();
  const notificationLog = await notificationModel.upsert({
    where: {
      communicationId_recipientUserId_notificationType: {
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
        notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
      },
    },
    create: {
      plantId: input.plantId,
      communicationId: input.communicationId,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId,
      notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
      status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
    },
    update: {
      plantId: input.plantId,
      recipientEmail: input.recipientEmail,
      departmentId: input.departmentId,
      errorMessage: null,
    },
  });

  if (
    notificationLog.status === SafetyCommunicationNotificationDeliveryStatus.SENT
    || notificationLog.status === SafetyCommunicationNotificationDeliveryStatus.READ
  ) {
    return;
  }

  if (notificationLog.notificationId) {
    const existingNotification = await prisma.notification.findUnique({
      where: {
        id: notificationLog.notificationId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingNotification?.status === NotificationStatus.UNREAD) {
      await notificationModel.update({
        where: { id: notificationLog.id },
        data: {
          status: SafetyCommunicationNotificationDeliveryStatus.SENT,
          sentAt: notificationLog.sentAt ?? new Date(),
          errorMessage: null,
        },
      });
      return;
    }
  }

  try {
    const dashboardNotification = await prisma.notification.create({
      data: {
        userId: input.recipientUserId,
        plantId: input.plantId,
        title: input.title,
        body: input.body,
        channel: SAFETY_COMMUNICATION_APPROVED_CHANNEL,
        status: NotificationStatus.UNREAD,
      },
    });

    await notificationModel.update({
      where: { id: notificationLog.id },
      data: {
        notificationId: dashboardNotification.id,
        status: SafetyCommunicationNotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    await notificationModel.update({
      where: { id: notificationLog.id },
      data: {
        status: SafetyCommunicationNotificationDeliveryStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown floating alert error",
      },
    });
    logger.error(
      {
        error,
        communicationId: input.communicationId,
        recipientUserId: input.recipientUserId,
      },
      "failed_to_create_safety_communication_floating_alert",
    );
  }
}

export const SafetyCommunicationAlertService = {
  isRecipientManagementAvailable() {
    return hasSafetyCommunicationAlertRecipientDelegate();
  },

  async listRecipients(plantId: string) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
      allowMissing: true,
      context: "listRecipients",
    });
    if (!recipientModel) {
      return [];
    }

    const rows = await recipientModel.findMany({
      where: {
        plantId,
        isActive: true,
        user: {
          isActive: true,
          plantRoles: {
            some: {
              plantId,
              role: {
                code: RoleCode.N4_SUPERVISOR,
              },
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [
        { department: { name: "asc" } },
        { user: { name: "asc" } },
      ],
    });

    return rows.map((row): SafetyCommunicationAlertRecipientRow => ({
      id: row.id,
      userId: row.user.id,
      userName: row.user.name,
      userEmail: row.user.email,
      departmentId: row.department.id,
      departmentCode: row.department.code,
      departmentName: row.department.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async listRecipientOptions(plantId: string) {
    const [userRows, departments] = await prisma.$transaction([
      prisma.userPlantRole.findMany({
        where: {
          plantId,
          role: {
            code: RoleCode.N4_SUPERVISOR,
          },
          user: {
            isActive: true,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      }),
      prisma.area.findMany({
        where: {
          plantId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: [
          { name: "asc" },
          { code: "asc" },
        ],
      }),
    ]);

    const usersMap = new Map<string, SafetyCommunicationAlertRecipientUserOption>();
    userRows.forEach((row) => {
      usersMap.set(row.user.id, {
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
      });
    });

    return {
      users: Array.from(usersMap.values()),
      departments: departments.map((department): SafetyCommunicationAlertRecipientDepartmentOption => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
    };
  },

  async addRecipient(input: {
    plantId: string;
    userId: string;
    departmentId: string;
    actorUserId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate();
    const [department, supervisor, existingRecipient] = await prisma.$transaction([
      prisma.area.findFirst({
        where: {
          id: input.departmentId,
          plantId: input.plantId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      prisma.userPlantRole.findFirst({
        where: {
          userId: input.userId,
          plantId: input.plantId,
          role: {
            code: RoleCode.N4_SUPERVISOR,
          },
          user: {
            isActive: true,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      recipientModel.findUnique({
        where: {
          plantId_userId_departmentId: {
            plantId: input.plantId,
            userId: input.userId,
            departmentId: input.departmentId,
          },
        },
        select: {
          id: true,
          isActive: true,
        },
      }),
    ]);

    if (!department) {
      throw new SafetyCommunicationAlertRecipientError(
        "DEPARTMENT_NOT_FOUND",
        "Department not found for this plant.",
        404,
      );
    }

    if (!supervisor) {
      throw new SafetyCommunicationAlertRecipientError(
        "SUPERVISOR_NOT_FOUND",
        "Supervisor not found for this plant.",
        404,
      );
    }

    if (existingRecipient?.isActive) {
      throw new SafetyCommunicationAlertRecipientError(
        "DUPLICATE_RECIPIENT",
        "This supervisor is already assigned to the selected department.",
        409,
      );
    }

    const row = await recipientModel.upsert({
      where: {
        plantId_userId_departmentId: {
          plantId: input.plantId,
          userId: input.userId,
          departmentId: input.departmentId,
        },
      },
      create: {
        plantId: input.plantId,
        userId: input.userId,
        departmentId: input.departmentId,
        isActive: true,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      update: {
        isActive: true,
        updatedBy: input.actorUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return {
      id: row.id,
      userId: row.user.id,
      userName: row.user.name,
      userEmail: row.user.email,
      departmentId: row.department.id,
      departmentCode: row.department.code,
      departmentName: row.department.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } satisfies SafetyCommunicationAlertRecipientRow;
  },

  async removeRecipient(input: {
    id: string;
    plantId: string;
    actorUserId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate();
    const updated = await recipientModel.updateMany({
      where: {
        id: input.id,
        plantId: input.plantId,
        isActive: true,
      },
      data: {
        isActive: false,
        updatedBy: input.actorUserId,
      },
    });

    return updated.count > 0;
  },

  async listUnreadFloatingAlerts(input: {
    plantId: string;
    userId: string;
  }) {
    const notificationModel = getSafetyCommunicationNotificationDelegate({
      allowMissing: true,
      context: "listUnreadFloatingAlerts",
    });
    if (!notificationModel) {
      return [];
    }

    const rows = await notificationModel.findMany({
      where: {
        recipientUserId: input.userId,
        notificationType: SafetyCommunicationNotificationType.FLOATING_ALERT,
        notification: {
          plantId: input.plantId,
          userId: input.userId,
          channel: SAFETY_COMMUNICATION_APPROVED_CHANNEL,
          status: NotificationStatus.UNREAD,
        },
      },
      include: {
        notification: true,
        communication: {
          include: {
            plant: {
              select: {
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

    return rows.flatMap((row): SafetyCommunicationFloatingAlert[] => {
      if (!row.notification) {
        return [];
      }

      return [{
        id: row.notification.id,
        communicationId: row.communicationId,
        title: row.notification.title,
        body: row.notification.body,
        createdAt: row.notification.createdAt.toISOString(),
        actionUrl: buildCommunicationDetailPaths({
          plantCode: row.communication.plant.code,
          communicationId: row.communicationId,
        }).relativePath,
      }];
    });
  },

  async safeDispatchApprovedCommunicationAlerts(input: {
    communicationId: string;
    actorRole?: RoleCode | null;
  }) {
    if (input.actorRole !== RoleCode.N3_SAFETY) {
      return;
    }

    try {
      await this.dispatchApprovedCommunicationAlerts({
        communicationId: input.communicationId,
      });
    } catch (error) {
      logger.error(
        {
          error,
          communicationId: input.communicationId,
          actorRole: input.actorRole,
        },
        "failed_to_dispatch_safety_communication_alerts",
      );
    }
  },

  async dispatchApprovedCommunicationAlerts(input: {
    communicationId: string;
  }) {
    const recipientModel = getSafetyCommunicationAlertRecipientDelegate({
      allowMissing: true,
      context: "dispatchApprovedCommunicationAlerts.recipients",
    });
    const notificationModel = getSafetyCommunicationNotificationDelegate({
      allowMissing: true,
      context: "dispatchApprovedCommunicationAlerts.notifications",
    });
    if (!recipientModel || !notificationModel) {
      return;
    }

    const context = await loadApprovedCommunicationContext(input.communicationId);
    if (!context) {
      logger.warn(
        { communicationId: input.communicationId },
        "approved_safety_communication_not_found_for_alert_dispatch",
      );
      return;
    }

    const { communication, targetEmployee, sewo } = context;

    if (communication.status !== CommunicationStatus.VALID_OPEN) {
      logger.info(
        {
          communicationId: communication.id,
          status: communication.status,
        },
        "skipping_safety_communication_alert_dispatch_for_non_approved_status",
      );
      return;
    }

    if (!sewo) {
      logger.info(
        { communicationId: communication.id },
        "skipping_safety_communication_alert_dispatch_without_sewo",
      );
      return;
    }

    if (!targetEmployee) {
      logger.warn(
        { communicationId: communication.id },
        "skipping_safety_communication_alert_dispatch_without_target_worker",
      );
      return;
    }

    if (!targetEmployee.dept?.trim()) {
      logger.warn(
        {
          communicationId: communication.id,
          targetEmployeeId: targetEmployee.id,
          employeeNo: targetEmployee.employeeNo,
        },
        "skipping_safety_communication_alert_dispatch_without_worker_department",
      );
      return;
    }

    const department = await resolveDepartmentByWorkerDept({
      plantId: communication.plantId,
      workerDept: targetEmployee.dept,
    });

    if (!department) {
      logger.warn(
        {
          communicationId: communication.id,
          targetEmployeeId: targetEmployee.id,
          workerDept: targetEmployee.dept,
        },
        "skipping_safety_communication_alert_dispatch_without_matching_department",
      );
      return;
    }

    const recipients = await recipientModel.findMany({
      where: {
        plantId: communication.plantId,
        departmentId: department.id,
        isActive: true,
        user: {
          isActive: true,
          plantRoles: {
            some: {
              plantId: communication.plantId,
              role: {
                code: RoleCode.N4_SUPERVISOR,
              },
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    if (!recipients.length) {
      logger.info(
        {
          communicationId: communication.id,
          departmentId: department.id,
        },
        "no_safety_communication_alert_recipients_found",
      );
      return;
    }

    const typeLabel = formatSewoOccurrenceType({
      communicationType: communication.type,
    });
    const sifPsifLabel = getSifPsifDisplayLabel(getSifPsifResultFromTemplateData(sewo.templateData));
    const content = buildApprovedAlertContent({
      plantCode: communication.plant.code,
      communicationId: communication.id,
      typeLabel,
      workstation: communication.workstation?.name ?? "-",
      occurredAt: communication.eventDatetime,
      workerName: targetEmployee.name ?? communication.targetText ?? "-",
      sifPsifLabel,
      description: communication.description.trim() || "-",
    });

    await Promise.all(
      recipients.map(async (recipient) => {
        await Promise.all([
          sendEmailNotification({
            plantId: communication.plantId,
            communicationId: communication.id,
            recipientUserId: recipient.user.id,
            recipientEmail: recipient.user.email,
            departmentId: department.id,
            title: content.title,
            body: content.body,
            html: content.html,
          }),
          sendFloatingAlertNotification({
            plantId: communication.plantId,
            communicationId: communication.id,
            recipientUserId: recipient.user.id,
            recipientEmail: recipient.user.email,
            departmentId: department.id,
            title: content.title,
            body: content.body,
          }),
        ]);
      }),
    );

    logger.info(
      {
        communicationId: communication.id,
        departmentId: department.id,
        recipients: recipients.map((recipient) => recipient.user.id),
      },
      "dispatched_safety_communication_alerts",
    );
  },
};
