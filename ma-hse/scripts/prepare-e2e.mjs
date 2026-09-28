import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
  throw new Error("E2E report QR fixtures cannot be prepared in production.");
}
if (process.env.REPORT_QR_REGENERATION_ENABLED !== "true") {
  throw new Error("Report QR regeneration is disabled. Enable it explicitly only in an isolated test environment.");
}

const prisma = new PrismaClient();

function hashAccessToken(token, pepper) {
  return crypto.createHash("sha256").update(`${token}:${pepper}`).digest("hex");
}

const plantCode = "pl01";
const reportToken = "pl01-report-seed-token";
const pepper = process.env.TOKEN_PEPPER ?? "dev-pepper-1234567890123456";

try {
  const plant = await prisma.plant.findUnique({
    where: { code: plantCode },
    select: { id: true },
  });

  if (!plant) {
    throw new Error(`Plant ${plantCode} not found for E2E preparation`);
  }

  await prisma.plantAccessToken.upsert({
    where: {
      plantId_type_tokenHash: {
        plantId: plant.id,
        type: "REPORT",
        tokenHash: hashAccessToken(reportToken, pepper),
      },
    },
    update: {
      isActive: true,
      revokedAt: null,
    },
    create: {
      plantId: plant.id,
      type: "REPORT",
      tokenHash: hashAccessToken(reportToken, pepper),
      isActive: true,
    },
  });
} finally {
  await prisma.$disconnect();
}
