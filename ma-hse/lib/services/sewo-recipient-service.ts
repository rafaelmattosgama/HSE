import { prisma } from "@/lib/prisma";

export const SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS = ["pt", "it", "en", "pl", "de", "ro", "fr"] as const;
export type SewoReportRecipientLanguage = (typeof SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS)[number];

export type SewoReportRecipient = {
  id: string;
  name: string;
  email: string;
  language: SewoReportRecipientLanguage;
};

const SEWO_REPORT_RECIPIENT_LIST_NAME = "S-EWO External Reports";

export function normalizeSewoReportRecipientLanguage(
  language: string | null | undefined,
): SewoReportRecipientLanguage {
  const normalized = language?.trim().toLowerCase();
  if (normalized && SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS.includes(normalized as SewoReportRecipientLanguage)) {
    return normalized as SewoReportRecipientLanguage;
  }

  return "en";
}

function mapRecipient(input: {
  id: string;
  name: string | null;
  email: string;
  language: string;
}): SewoReportRecipient {
  return {
    id: input.id,
    name: input.name?.trim() || input.email,
    email: input.email,
    language: normalizeSewoReportRecipientLanguage(input.language),
  };
}

export async function findSewoReportRecipientList(plantId: string) {
  return prisma.reportRecipientList.findFirst({
    where: {
      plantId,
      scope: "PLANT",
      name: SEWO_REPORT_RECIPIENT_LIST_NAME,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function ensureSewoReportRecipientList(plantId: string) {
  const existing = await findSewoReportRecipientList(plantId);
  if (existing) {
    return existing;
  }

  return prisma.reportRecipientList.create({
    data: {
      plantId,
      scope: "PLANT",
      name: SEWO_REPORT_RECIPIENT_LIST_NAME,
    },
  });
}

export async function listSewoReportRecipients(plantId: string) {
  const list = await findSewoReportRecipientList(plantId);
  if (!list) {
    return [] as SewoReportRecipient[];
  }

  const recipients = await prisma.reportRecipient.findMany({
    where: {
      listId: list.id,
      isActive: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      language: true,
    },
  });

  return recipients.map(mapRecipient);
}
