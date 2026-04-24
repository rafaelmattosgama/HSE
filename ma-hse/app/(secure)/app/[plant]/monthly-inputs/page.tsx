import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { PlantMonthlyInputsForm } from "@/components/feature/plant-monthly-inputs-form";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { resolveMonthlyInputLayout } from "@/lib/services/monthly-input-layout";
import { buildMonthlyInputRows } from "@/lib/services/monthly-inputs";

export default async function PlantMonthlyInputsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const allowed = session.user.plantRoles.some(
    (entry) =>
      (entry.plantCode === plant || entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE) &&
      (entry.role === RoleCode.N0_ADMIN ||
        entry.role === RoleCode.N1_CORPORATE ||
        entry.role === RoleCode.N2_PLANT_MANAGER ||
        entry.role === RoleCode.N3_SAFETY),
  );

  if (!allowed) {
    redirect(`/app/${plant}/dashboards`);
  }

  const plantRow = await prisma.plant.findUniqueOrThrow({
    where: { code: plant },
  });

  const year = new Date().getUTCFullYear();
  const [rows, kpiRows, layoutParameter, customRowsParameter] = await prisma.$transaction([
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        year,
      },
      orderBy: {
        month: "asc",
      },
    }),
    prisma.safetyKpiMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        year,
      },
      orderBy: {
        month: "asc",
      },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plantRow.id,
          key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        },
      },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plantRow.id,
          key: `${SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT}_${year}_ROWS`,
        },
      },
    }),
  ]);

  const months = buildMonthlyInputRows(rows, kpiRows);
  const { indicatorConfig, customRows } = resolveMonthlyInputLayout(
    layoutParameter?.valueJson,
    customRowsParameter?.valueJson,
  );

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Monthly Inputs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Monthly manual inputs for workforce, working hours, energy, water, compressed air and waste.
        </p>
      </header>

      <PlantMonthlyInputsForm
        plantCode={plant}
        initialYear={year}
        initialMonths={months}
        initialIndicatorConfig={indicatorConfig}
        initialCustomRows={customRows}
      />
    </>
  );
}
