import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { MODULE_REQUEST_PATH_HEADER } from "@/lib/role-modules";
import { isRoleModuleRequestAllowed } from "@/lib/services/role-module-service";

export default async function PlantModuleTemplate({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const pathname = (await headers()).get(MODULE_REQUEST_PATH_HEADER) ?? "";
  if (!await isRoleModuleRequestAllowed(pathname, session.user.plantRoles)) redirect("/app/corporate");
  return children;
}
