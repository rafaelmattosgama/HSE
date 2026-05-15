import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const CONTRACTOR_COOKIE = "ma_hse_contractor_session";

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function createContractorSession(companyId: string) {
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await prisma.externalCompanySession.create({
    data: {
      companyId,
      sessionToken,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(CONTRACTOR_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearContractorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CONTRACTOR_COOKIE)?.value;
  if (token) {
    await prisma.externalCompanySession.deleteMany({
      where: { sessionToken: token },
    });
  }
  cookieStore.delete(CONTRACTOR_COOKIE);
}

export async function getContractorSessionCompany() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CONTRACTOR_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.externalCompanySession.findUnique({
    where: { sessionToken: token },
    include: {
      company: {
        include: {
          plant: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    cookieStore.delete(CONTRACTOR_COOKIE);
    if (session) {
      await prisma.externalCompanySession.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.company;
}
