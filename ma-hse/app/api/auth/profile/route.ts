import { getServerSession } from "next-auth";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { authOptions } from "@/lib/auth/options";
import { assertSameOrigin, parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateOwnProfileInput } from "@/lib/validation/dtos";

const LOCALE_COOKIE_NAME = "ehs_locale";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return fail("UNAUTHORIZED", "Authentication required", 401);
  }

  if (!assertSameOrigin(request)) {
    return fail("FORBIDDEN", "Invalid request origin", 403);
  }

  const parsed = await parseBody(request, updateOwnProfileInput);
  if ("error" in parsed) {
    return parsed.error;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      isActive: true,
      name: true,
      language: true,
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

  const nextName = parsed.data.name.trim();
  const nextLanguage = parsed.data.language;

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: nextName,
      language: nextLanguage,
    },
    select: {
      id: true,
      name: true,
      language: true,
    },
  });

  await writeAuditLog({
    entityType: "User",
    entityId: user.id,
    action: "UPDATE_OWN_PROFILE",
    actorUserId: user.id,
    plantId: user.plantRoles[0]?.plantId ?? null,
    diff: buildDiff(
      {
        name: user.name,
        language: user.language,
      },
      {
        name: updatedUser.name,
        language: updatedUser.language,
      },
    ),
  });

  const response = ok({ user: updatedUser });
  response.cookies.set(LOCALE_COOKIE_NAME, updatedUser.language, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  return response;
}
