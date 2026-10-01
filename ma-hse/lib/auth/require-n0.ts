import { getServerSession } from "next-auth";
import { RoleCode } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import { fail } from "@/lib/api";

export async function requireN0() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: fail("UNAUTHORIZED", "Authentication required", 401) } as const;
  if (!session.user.plantRoles.some(entry => entry.role === RoleCode.N0_ADMIN)) {
    return { error: fail("FORBIDDEN", "N0 admin access required", 403) } as const;
  }
  return { session } as const;
}
