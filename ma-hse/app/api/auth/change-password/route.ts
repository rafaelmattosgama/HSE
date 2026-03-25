import { compare, hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth/options";
import { assertSameOrigin, parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { changePasswordInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  if (!assertSameOrigin(request)) {
    return fail("FORBIDDEN", "Invalid request origin", 403);
  }

  const parsed = await parseBody(request, changePasswordInput);
  if ("error" in parsed) {
    return parsed.error;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      isActive: true,
      passwordHash: true,
      forcePasswordChange: true,
      plantRoles: {
        select: {
          plantId: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
      },
    },
  });

  if (!user || !user.isActive) {
    return fail("FORBIDDEN", "User is inactive", 403);
  }

  if (!user.passwordHash) {
    return fail("PASSWORD_NOT_SET", "Current password is not set for this account", 422);
  }

  const isCurrentPasswordValid = await compare(parsed.data.currentPassword, user.passwordHash);
  if (!isCurrentPasswordValid) {
    return fail("INVALID_CREDENTIALS", "Current password is incorrect", 422);
  }

  const nextHash = await hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: nextHash,
      forcePasswordChange: false,
    },
  });

  await writeAuditLog({
    entityType: "User",
    entityId: user.id,
    action: "CHANGE_PASSWORD",
    actorUserId: user.id,
    plantId: user.plantRoles[0]?.plantId ?? null,
    diff: buildDiff(
      { forcePasswordChange: user.forcePasswordChange },
      { forcePasswordChange: false },
    ),
  });

  return ok({ changed: true });
}
