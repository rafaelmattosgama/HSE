import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { SewoReportRecipient } from "@/lib/services/sewo-recipient-service";
import { GeneralSettingsError } from "@/lib/services/general-settings-service";

export const GENERAL_SEWO_RECIPIENTS_KEY = "GENERAL_SEWO_RECIPIENTS";
export const generalRecipientInput = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
});
export const generalRecipientDeleteInput = z.object({ id: z.string().uuid() });

export async function readGeneralSewoRecipients(tx: Prisma.TransactionClient = prisma): Promise<SewoReportRecipient[]> {
  const parameter = await tx.systemParameter.findFirst({ where: { plantId: null, key: GENERAL_SEWO_RECIPIENTS_KEY } });
  if (parameter) return z.array(generalRecipientInput.required()).parse(parameter.valueJson);
  const recipients = await tx.reportRecipient.findMany({
    where: { isActive: true, list: { name: "S-EWO External Reports" } },
    orderBy: [{ email: "asc" }, { id: "asc" }],
  });
  const byEmail = new Map<string, SewoReportRecipient>();
  for (const recipient of recipients) {
    const email = recipient.email.toLowerCase();
    if (!byEmail.has(email)) byEmail.set(email, { id: recipient.id, email, name: recipient.name || email,
      language: generalRecipientInput.shape.language.catch("en").parse(recipient.language) });
  }
  return [...byEmail.values()];
}

export async function mutateGeneralSewoRecipient(input: z.infer<typeof generalRecipientInput> | z.infer<typeof generalRecipientDeleteInput>, actorUserId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${GENERAL_SEWO_RECIPIENTS_KEY}))`;
    const before = await readGeneralSewoRecipients(tx);
    if (input.id && !before.some(row => row.id === input.id)) throw new GeneralSettingsError("Recipient not found.", 404);
    let recipient: SewoReportRecipient | undefined;
    if ("email" in input) {
      if (before.some(row => row.email === input.email && row.id !== input.id)) throw new GeneralSettingsError("A recipient with this email already exists.", 409);
      recipient = { ...input, id: input.id ?? randomUUID() };
    }
    const recipients = [...before.filter(row => row.id !== input.id), ...(recipient ? [recipient] : [])];
    const parameter = await tx.systemParameter.findFirst({ where: { plantId: null, key: GENERAL_SEWO_RECIPIENTS_KEY } });
    if (parameter) await tx.systemParameter.update({ where: { id: parameter.id }, data: { valueJson: recipients } });
    else await tx.systemParameter.create({ data: { plantId: null, key: GENERAL_SEWO_RECIPIENTS_KEY, valueJson: recipients } });
    await writeAuditLog({ entityType: "GeneralSewoRecipients", entityId: GENERAL_SEWO_RECIPIENTS_KEY, action: "UPDATE", actorUserId,
      diff: { before: { recipients: before }, after: { recipients }, fieldsChanged: ["recipients"] } }, tx);
    return { recipient, recipientId: input.id };
  });
}
