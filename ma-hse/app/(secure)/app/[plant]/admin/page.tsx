import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getCreatableRoles } from "@/lib/rbac/user-management";
import { UserManager } from "@/components/feature/user-manager";
import { QrTokenManager } from "@/components/feature/qr-token-manager";
import { SlaEditor } from "@/components/feature/sla-editor";
import { prisma } from "@/lib/prisma";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
    ? RoleCode.N1_CORPORATE
    : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;

  const canManageUsers = actorRole === RoleCode.N1_CORPORATE || actorRole === RoleCode.N3_SAFETY;
  const allowedCreateRoles = actorRole ? getCreatableRoles(actorRole) : [];

  const [sla, recipients, rules] = await prisma.$transaction([
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plantRow.id,
          key: "SLA_CONFIG",
        },
      },
    }),
    prisma.reportRecipientList.findMany({
      where: {
        OR: [{ plantId: plantRow.id }, { scope: "CORPORATE" }],
      },
      include: {
        recipients: true,
      },
    }),
    prisma.alertRule.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
        repetitionRule: true,
      },
    }),
  ]);

  const userPlantRoles = canManageUsers
    ? await prisma.userPlantRole.findMany({
        where: {
          plantId: plantRow.id,
        },
        include: {
          role: true,
          user: true,
        },
      })
    : [];

  const slaConfig = (sla?.valueJson as { LOW?: number; MEDIUM?: number; HIGH?: number } | null) ?? {
    LOW: 21,
    MEDIUM: 14,
    HIGH: 7,
  };

  const users = userPlantRoles
    .map((entry) => ({
      id: entry.user.id,
      email: entry.user.email,
      name: entry.user.name,
      language: entry.user.language,
      isActive: entry.user.isActive,
      role: entry.role.code,
      createdAt: entry.user.createdAt,
      updatedAt: entry.user.updatedAt,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.name.localeCompare(b.name);
    });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Plant Admin (N3)</h1>
        <p className="mt-1 text-sm text-slate-600">Master data, recipients, QR tokens, SLA and alert parameters.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <SlaEditor
          initial={{
            LOW: Number(slaConfig.LOW ?? 21),
            MEDIUM: Number(slaConfig.MEDIUM ?? 14),
            HIGH: Number(slaConfig.HIGH ?? 7),
          }}
        />
        <QrTokenManager />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recipient lists</h2>
        <div className="mt-3 space-y-3">
          {recipients.map((list) => (
            <article key={list.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{list.name} ({list.scope})</p>
              <p className="text-xs text-slate-600">{list.recipients.length} recipients</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alert rules</h2>
        <div className="mt-3 space-y-3">
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
              <p className="text-xs text-slate-600">
                {rule.repetitionRule?.triggerType} - threshold {rule.repetitionRule?.thresholdCount} in {rule.repetitionRule?.windowDays} days
              </p>
            </article>
          ))}
        </div>
      </section>

      {canManageUsers ? (
        <UserManager users={users} allowedCreateRoles={allowedCreateRoles} />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          User management is available only for N1 and N3 roles.
        </section>
      )}
    </>
  );
}
