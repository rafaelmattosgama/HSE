import { RoleCode } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth/session";
import { fail } from "@/lib/api";
import { hasPlantAccess } from "@/lib/rbac/evaluator";

export async function requireAuth() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return { error: fail("UNAUTHORIZED", "Authentication required", 401) as NextResponse };
  }

  return { session };
}

export async function requirePlantAccess(plantCode: string, allowedRoles: RoleCode[]) {
  const auth = await requireAuth();
  if ("error" in auth) {
    return auth;
  }

  const { session } = auth;
  const userRoles = session.user.plantRoles;
  const hasAccess = hasPlantAccess({
    plantCode,
    roles: userRoles,
    allowedRoles,
  });

  if (!hasAccess) {
    return {
      error: fail("FORBIDDEN", "Insufficient role for plant scope", 403) as NextResponse,
    };
  }

  const hasAdmin = userRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  if (hasAdmin) {
    return { session, role: RoleCode.N0_ADMIN };
  }

  const hasCorporate = userRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  if (hasCorporate) {
    return { session, role: RoleCode.N1_CORPORATE };
  }

  const roleEntry = userRoles.find((entry) => entry.plantCode === plantCode && allowedRoles.includes(entry.role));
  if (!roleEntry) return { session, role: RoleCode.N0_ADMIN };

  return {
    session,
    role: roleEntry.role,
    plantId: roleEntry.plantId,
  };
}
