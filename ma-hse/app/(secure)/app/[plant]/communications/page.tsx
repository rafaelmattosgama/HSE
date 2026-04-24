import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { CreateCommunicationQuick } from "@/components/feature/create-communication-quick";
import { CommunicationsTable } from "@/components/feature/communications-table";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";

const LINKED_ACTION_ROLES: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
];

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const actorRole =
    session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ??
    (session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE) ? RoleCode.N1_CORPORATE : null);

  const [communications, areas, workstations, plantUsers, employees, bodyParts, injuryTypes] = await prisma.$transaction([
    prisma.communication.findMany({
      where: {
        plantId: plantRow.id,
        status: {
          in: ["VALID_OPEN", "ONGOING", "CLOSED"],
        },
      },
      include: { area: true, workstation: true },
      orderBy: { eventDatetime: "desc" },
      take: 200,
    }),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.bodyPart.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.injuryType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNo, employee]));

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
        <p className="mt-1 text-sm text-slate-600">All safety communications scoped to this plant, with simplified statuses and operational filters.</p>
      </header>

      <CreateCommunicationQuick
        areas={areas.map((area) => ({ id: area.id, name: area.name }))}
        workstations={workstations.map((workstation) => ({ id: workstation.id, name: workstation.name }))}
        actionOwners={plantUsers.map((entry) => ({ id: entry.user.id, name: entry.user.name }))}
        employees={employees.map((employee) => ({ id: employee.id, name: employee.name, employeeNo: employee.employeeNo }))}
        bodyParts={bodyParts.map((bodyPart) => ({ id: bodyPart.id, name: bodyPart.name }))}
        injuryTypes={injuryTypes.map((injuryType) => ({ id: injuryType.id, name: injuryType.name }))}
        canLinkAction={actorRole ? LINKED_ACTION_ROLES.includes(actorRole) : false}
      />

      <CommunicationsTable
        plant={plant}
        rows={communications.map((row) => {
          const reporterEmployee = employeeByNumber.get(row.reporterEmployeeNo ?? "");
          return {
            id: row.id,
            eventDatetime: row.eventDatetime.toISOString(),
            type: row.type,
            status: row.status,
            reporterName: reporterEmployee ? `${reporterEmployee.employeeNo} - ${reporterEmployee.name}` : row.reporterName,
            department: row.area?.name ?? "-",
            location: row.workstation?.name ?? "-",
          };
        })}
      />
    </>
  );
}
