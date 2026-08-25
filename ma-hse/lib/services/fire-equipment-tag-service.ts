import crypto from "node:crypto";
import { FireEquipmentTagType, type Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { appUrl } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";

type TransactionClient = Prisma.TransactionClient;
type PdfDocument = ReturnType<typeof createPdfDocument>;

// Ambiguous characters (0/O, 1/I/L) are dropped — §5.4 prints tagCode in
// human-readable text on the label for manual entry when the QR is unreadable.
const TAG_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAG_CODE_LENGTH = 8;
const TAG_CODE_MAX_ATTEMPTS = 5;

function randomTagCode(): string {
  let code = "";
  for (let i = 0; i < TAG_CODE_LENGTH; i += 1) {
    code += TAG_CODE_ALPHABET[crypto.randomInt(0, TAG_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueTagCode(tx: TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < TAG_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomTagCode();
    const existing = await tx.fireEquipmentTagAssignment.findUnique({ where: { tagCode: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Failed to generate a unique tag code — please retry");
}

export function tagUrl(tagCode: string) {
  return appUrl(`/scie/${tagCode}`);
}

export type FireEquipmentTagView = {
  id: string;
  tagCode: string;
  tagType: FireEquipmentTagType;
  assignedAt: Date;
  url: string;
};

export function toTagView(row: { id: string; tagCode: string; tagType: FireEquipmentTagType; assignedAt: Date }): FireEquipmentTagView {
  return { id: row.id, tagCode: row.tagCode, tagType: row.tagType, assignedAt: row.assignedAt, url: tagUrl(row.tagCode) };
}

export type FireEquipmentTagLabelInput = {
  internalCode: string;
  fireEquipmentTypeName: string;
  tagCode: string;
  url: string;
};

function pdfBufferFromDocument(doc: PdfDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const PAGE_MARGIN = 40;
const LABEL_WIDTH = 250;
const LABEL_HEIGHT = 130;
const LABEL_GAP = 20;
const LABELS_PER_ROW = 2;
const ROWS_PER_PAGE = 5;
const LABELS_PER_PAGE = LABELS_PER_ROW * ROWS_PER_PAGE;

async function drawLabel(doc: PdfDocument, label: FireEquipmentTagLabelInput, x: number, y: number) {
  doc.roundedRect(x, y, LABEL_WIDTH, LABEL_HEIGHT, 6).strokeColor("#cbd5e1").lineWidth(1).stroke();

  const qrPng = await QRCode.toBuffer(label.url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  doc.image(qrPng, x + 12, y + 15, { width: 100, height: 100 });

  const textX = x + 122;
  const textWidth = LABEL_WIDTH - 134;
  doc.fontSize(12).fillColor("#0f172a").text(label.internalCode, textX, y + 16, { width: textWidth });
  doc.fontSize(9).fillColor("#334155").text(label.fireEquipmentTypeName, textX, y + 36, { width: textWidth });
  doc.fontSize(8).fillColor("#64748b").text(label.tagCode, textX, y + 96, { width: textWidth });
}

export const FireEquipmentTagService = {
  async getActiveTag(fireEquipmentId: string): Promise<FireEquipmentTagView | null> {
    const active = await prisma.fireEquipmentTagAssignment.findFirst({
      where: { fireEquipmentId, isActive: true },
      select: { id: true, tagCode: true, tagType: true, assignedAt: true },
    });
    return active ? toTagView(active) : null;
  },

  /**
   * §5.6: replacing a tag never edits the existing row — it marks the
   * current active assignment unassignedAt/unassignReason and creates a new
   * one with a fresh tagCode, all inside one transaction. With no current
   * active assignment (first time this equipment gets a tag), this reduces
   * to a plain create. "Only one isActive = true row at a time" (§3.3) is
   * enforced here, not just by tagCode's DB-level uniqueness.
   */
  async assignOrReplaceTag(
    plant: { id: string },
    fireEquipmentId: string,
    input: { tagType: FireEquipmentTagType; unassignReason?: string | null },
    actorUserId: string,
  ): Promise<FireEquipmentTagView> {
    const equipment = await prisma.fireEquipment.findFirst({ where: { id: fireEquipmentId, plantId: plant.id }, select: { id: true } });
    if (!equipment) {
      throw new Error("Fire equipment not found for plant scope");
    }

    return prisma.$transaction(async (tx) => {
      const current = await tx.fireEquipmentTagAssignment.findFirst({
        where: { fireEquipmentId, isActive: true },
      });

      if (current) {
        await tx.fireEquipmentTagAssignment.update({
          where: { id: current.id },
          data: {
            isActive: false,
            unassignedAt: new Date(),
            unassignReason: input.unassignReason ?? null,
          },
        });
      }

      const tagCode = await generateUniqueTagCode(tx);
      const created = await tx.fireEquipmentTagAssignment.create({
        data: {
          plantId: plant.id,
          fireEquipmentId,
          tagCode,
          tagType: input.tagType,
          assignedById: actorUserId,
        },
      });

      await writeAuditLog(
        {
          entityType: "FireEquipmentTagAssignment",
          entityId: created.id,
          action: current ? "REPLACED" : "ASSIGNED",
          actorUserId,
          plantId: plant.id,
          diff: buildDiff(
            current ? { tagCode: current.tagCode, tagType: current.tagType } : null,
            { tagCode: created.tagCode, tagType: created.tagType },
          ),
        },
        tx,
      );

      return toTagView(created);
    });
  },

  /** §5.4: one or several labels (QR + human-readable code) per PDF, laid out in a grid, new page once a page fills up. */
  async buildTagLabelsPdf(labels: FireEquipmentTagLabelInput[]): Promise<Buffer> {
    const doc = createPdfDocument({ margin: PAGE_MARGIN, size: "A4" });

    for (let index = 0; index < labels.length; index += 1) {
      const positionOnPage = index % LABELS_PER_PAGE;
      if (index > 0 && positionOnPage === 0) {
        doc.addPage();
      }
      const column = positionOnPage % LABELS_PER_ROW;
      const row = Math.floor(positionOnPage / LABELS_PER_ROW);
      const x = PAGE_MARGIN + column * (LABEL_WIDTH + LABEL_GAP);
      const y = PAGE_MARGIN + row * (LABEL_HEIGHT + LABEL_GAP);
      await drawLabel(doc, labels[index], x, y);
    }

    return pdfBufferFromDocument(doc);
  },
};
