import crypto from "node:crypto";
import { FireEquipmentTagType, FireTagBindingMode, type Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { TAG_CODE_ALPHABET, TAG_CODE_LENGTH } from "@/lib/fire-equipment-tag-code";
import { appUrl } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";

type TransactionClient = Prisma.TransactionClient;
type PdfDocument = ReturnType<typeof createPdfDocument>;

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

/** Thrown by bindByUid when the uid is already actively bound elsewhere — the route surfaces this as a structured 409, never a silent reassignment (§5.1 rule 3). */
export class FireEquipmentTagConflictError extends Error {
  constructor(
    public readonly equipmentId: string,
    public readonly equipmentInternalCode: string,
  ) {
    super(`Tag already assigned to equipment ${equipmentInternalCode}`);
    this.name = "FireEquipmentTagConflictError";
  }
}

export type FireEquipmentTagView = {
  id: string;
  tagUid: string | null;
  tagCode: string | null;
  tagType: FireEquipmentTagType;
  chipType: string | null;
  bindingMode: FireTagBindingMode;
  assignedAt: Date;
  writtenAt: Date | null;
  url: string | null;
};

export function toTagView(row: {
  id: string;
  tagUid: string | null;
  tagCode: string | null;
  tagType: FireEquipmentTagType;
  chipType: string | null;
  bindingMode: FireTagBindingMode;
  assignedAt: Date;
  writtenAt: Date | null;
}): FireEquipmentTagView {
  return {
    id: row.id,
    tagUid: row.tagUid,
    tagCode: row.tagCode,
    tagType: row.tagType,
    chipType: row.chipType,
    bindingMode: row.bindingMode,
    assignedAt: row.assignedAt,
    writtenAt: row.writtenAt,
    url: row.tagCode ? tagUrl(row.tagCode) : null,
  };
}

export type FireEquipmentTagLabelInput = {
  internalCode: string;
  fireEquipmentTypeName: string;
  tagCode: string;
  url: string;
};

export type FireEquipmentTagLookupResult = {
  fireEquipmentId: string;
  internalCode: string;
  fireEquipmentTypeName: string;
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
      select: { id: true, tagUid: true, tagCode: true, tagType: true, chipType: true, bindingMode: true, assignedAt: true, writtenAt: true },
    });
    return active ? toTagView(active) : null;
  },

  /**
   * §5.1 rule 2: resolve by UID, scoped to this plant. Used both for the
   * "scan an unknown tag out in the field" discovery flow and as the
   * conflict check ahead of bindByUid. A miss is a normal outcome (rule 3),
   * not an error — callers get null, not a thrown exception.
   */
  async resolveByUid(plantId: string, tagUid: string): Promise<FireEquipmentTagLookupResult | null> {
    const assignment = await prisma.fireEquipmentTagAssignment.findFirst({
      where: { tagUid, isActive: true, plantId },
      select: {
        fireEquipment: { select: { id: true, internalCode: true, fireEquipmentType: { select: { name: true } } } },
      },
    });
    if (!assignment) return null;
    return {
      fireEquipmentId: assignment.fireEquipment.id,
      internalCode: assignment.fireEquipment.internalCode,
      fireEquipmentTypeName: assignment.fireEquipment.fireEquipmentType.name,
    };
  },

  /**
   * §5.6: replacing a tag never edits the existing row — it marks the
   * current active assignment unassignedAt/unassignReason and creates a new
   * one with a fresh tagCode, all inside one transaction. With no current
   * active assignment (first time this equipment gets a tag), this reduces
   * to a plain create. "Only one isActive = true row at a time" (§3.3) is
   * enforced here, not just by tagCode's DB-level uniqueness.
   *
   * This is the no-scan path — no tagUid is ever involved here, so
   * bindingMode is always CODE_ONLY. input.tagCode lets a plant reuse a code
   * already printed on a physical label it owns instead of always minting a
   * fresh random one — validated for global uniqueness, same as the
   * auto-generated path.
   */
  async assignOrReplaceTag(
    plant: { id: string },
    fireEquipmentId: string,
    input: { tagType: FireEquipmentTagType; unassignReason?: string | null; tagCode?: string | null },
    actorUserId: string,
  ): Promise<FireEquipmentTagView> {
    const equipment = await prisma.fireEquipment.findFirst({ where: { id: fireEquipmentId, plantId: plant.id }, select: { id: true } });
    if (!equipment) {
      throw new Error("Fire equipment not found for plant scope");
    }

    const manualTagCode = input.tagCode?.trim() || null;
    if (manualTagCode) {
      const taken = await prisma.fireEquipmentTagAssignment.findUnique({ where: { tagCode: manualTagCode }, select: { id: true } });
      if (taken) {
        throw new Error(`Tag code "${manualTagCode}" is already assigned to another piece of equipment`);
      }
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

      const tagCode = manualTagCode ?? (await generateUniqueTagCode(tx));
      const created = await tx.fireEquipmentTagAssignment.create({
        data: {
          plantId: plant.id,
          fireEquipmentId,
          tagCode,
          tagType: input.tagType,
          bindingMode: FireTagBindingMode.CODE_ONLY,
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

  /**
   * §5.3, the core of Fase 3 — binds a physical tag discovered by Web NFC
   * scan to fireEquipmentId, by UID. Called ONCE, after the client already
   * knows whether the physical write (step 4 of the flow) succeeded — that's
   * what lets rule 5's "single transaction" persist tagUid + tagCode +
   * chipType + writtenAt together, instead of a two-phase create-then-
   * confirm dance. tagCode is generated CLIENT-SIDE (same alphabet/length,
   * see TAG_CODE_ALPHABET/TAG_CODE_LENGTH) before the write, because the
   * write needs a code to embed in the URL before this call ever happens;
   * the tiny collision risk is handled below by rejecting rather than
   * silently reassigning a different code than what's physically on the tag.
   *
   * transferFromEquipmentId must match the CURRENT conflicting equipment's
   * id, confirming the caller already saw the conflict and explicitly chose
   * to transfer (rule 3 — never reassign in silence). On a transfer, the
   * losing equipment's row is deactivated AND has tagUid cleared (not the
   * tagCode) — an inactive row must stop claiming a uid that's now bound
   * elsewhere, which is what keeps tagUid's plain unique constraint safe
   * without needing a partial/filtered index (see the schema comment).
   */
  async bindByUid(
    plant: { id: string },
    fireEquipmentId: string,
    input: {
      tagUid: string;
      tagCode: string;
      chipType?: string | null;
      writeSucceeded: boolean;
      transferFromEquipmentId?: string;
    },
    actorUserId: string,
  ): Promise<FireEquipmentTagView> {
    const equipment = await prisma.fireEquipment.findFirst({
      where: { id: fireEquipmentId, plantId: plant.id },
      select: { id: true, internalCode: true },
    });
    if (!equipment) {
      throw new Error("Fire equipment not found for plant scope");
    }

    const tagUid = input.tagUid.trim();
    const tagCode = input.tagCode.trim();
    if (!tagUid || !tagCode) {
      throw new Error("tagUid and tagCode are required");
    }

    const codeTaken = await prisma.fireEquipmentTagAssignment.findUnique({ where: { tagCode }, select: { id: true } });
    if (codeTaken) {
      throw new Error("Generated tag code collided with an existing one — please scan again");
    }

    const conflicting = await prisma.fireEquipmentTagAssignment.findFirst({
      where: { tagUid, isActive: true, NOT: { fireEquipmentId } },
      select: { id: true, fireEquipmentId: true, fireEquipment: { select: { internalCode: true } } },
    });

    if (conflicting && conflicting.fireEquipmentId !== input.transferFromEquipmentId) {
      throw new FireEquipmentTagConflictError(conflicting.fireEquipmentId, conflicting.fireEquipment.internalCode);
    }

    return prisma.$transaction(async (tx) => {
      if (conflicting) {
        await tx.fireEquipmentTagAssignment.update({
          where: { id: conflicting.id },
          data: {
            isActive: false,
            tagUid: null,
            unassignedAt: new Date(),
            unassignReason: `Transferred to equipment ${equipment.internalCode}`,
          },
        });
      }

      const current = await tx.fireEquipmentTagAssignment.findFirst({
        where: { fireEquipmentId, isActive: true },
      });
      if (current) {
        await tx.fireEquipmentTagAssignment.update({
          where: { id: current.id },
          data: {
            isActive: false,
            unassignedAt: new Date(),
            unassignReason: conflicting ? "Replaced via NFC transfer" : "Replaced via NFC scan",
          },
        });
      }

      const created = await tx.fireEquipmentTagAssignment.create({
        data: {
          plantId: plant.id,
          fireEquipmentId,
          tagUid,
          tagCode,
          tagType: FireEquipmentTagType.NFC_AND_QR,
          chipType: input.chipType?.trim() || null,
          bindingMode: input.writeSucceeded ? FireTagBindingMode.FULL : FireTagBindingMode.UID_ONLY,
          writtenAt: input.writeSucceeded ? new Date() : null,
          assignedById: actorUserId,
        },
      });

      await writeAuditLog(
        {
          entityType: "FireEquipmentTagAssignment",
          entityId: created.id,
          action: conflicting ? "TRANSFERRED" : current ? "REPLACED" : "ASSIGNED",
          actorUserId,
          plantId: plant.id,
          diff: buildDiff(
            current ? { tagUid: current.tagUid, tagCode: current.tagCode } : null,
            { tagUid: created.tagUid, tagCode: created.tagCode, bindingMode: created.bindingMode },
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
