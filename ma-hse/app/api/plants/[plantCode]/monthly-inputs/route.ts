import { Prisma, RoleCode } from "@prisma/client";
import { ok, fail } from "@/lib/api";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import { resolveMonthlyInputLayout } from "@/lib/services/monthly-input-layout";
import { buildMonthlyInputRows } from "@/lib/services/monthly-inputs";
import { updatePlantMonthlyInputsInput } from "@/lib/validation/dtos";

function toEnergyTotal(entry: { electricityFromGridMwh: number | null; selfProducedEnergyMwh: number | null }) {
  const values = [entry.electricityFromGridMwh, entry.selfProducedEnergyMwh].filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function toNonHazardousWasteTotal(
  entry: {
    ewc150101PaperCardboardPackagingTons: number | null;
    ewc150102PlasticPackagingTons: number | null;
    ewc150103WoodTons: number | null;
    ewc160117FerrousMetalsTons: number | null;
    ewc160118NonFerrousMetalsCopperTons: number | null;
    ewc170117ConstructionWasteTons: number | null;
    ewc200111Tons: number | null;
    ewc200136ElectricalElectronicEquipmentTons: number | null;
    ewc200139PlasticTons: number | null;
    ewc200301UnsortedUrbanWasteTons: number | null;
  },
) {
  const values = [
    entry.ewc150101PaperCardboardPackagingTons,
    entry.ewc150102PlasticPackagingTons,
    entry.ewc150103WoodTons,
    entry.ewc160117FerrousMetalsTons,
    entry.ewc160118NonFerrousMetalsCopperTons,
    entry.ewc170117ConstructionWasteTons,
    entry.ewc200111Tons,
    entry.ewc200136ElectricalElectronicEquipmentTons,
    entry.ewc200139PlasticTons,
    entry.ewc200301UnsortedUrbanWasteTons,
  ].filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function hasMonthlyInputAccess(roles: Array<{ plantCode: string; role: RoleCode }>, plantCode: string) {
  return roles.some(
    (entry) =>
      (entry.plantCode === plantCode || entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE) &&
      (entry.role === RoleCode.N0_ADMIN ||
        entry.role === RoleCode.N1_CORPORATE ||
        entry.role === RoleCode.N2_PLANT_MANAGER ||
        entry.role === RoleCode.N3_SAFETY),
  );
}

function monthlyCustomRowsKey(year: number) {
  return `${SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT}_${year}_ROWS`;
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!hasMonthlyInputAccess(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Monthly inputs available only for N0, N1, N2 and N3", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());

  if (!Number.isInteger(year)) {
    return fail("INVALID_INPUT", "year must be a valid integer", 422);
  }

  const [rows, kpiRows, layoutParameter, customRowsParameter] = await prisma.$transaction([
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plant.id,
        year,
      },
      orderBy: {
        month: "asc",
      },
    }),
    prisma.safetyKpiMonthlyInput.findMany({
      where: {
        plantId: plant.id,
        year,
      },
      orderBy: {
        month: "asc",
      },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plant.id,
          key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        },
      },
    }),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plant.id,
          key: monthlyCustomRowsKey(year),
        },
      },
    }),
  ]);

  const data = buildMonthlyInputRows(rows, kpiRows);
  const { indicatorConfig, customRows } = resolveMonthlyInputLayout(
    layoutParameter?.valueJson,
    customRowsParameter?.valueJson,
  );

  return ok({ year, months: data, indicatorConfig, customRows });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!hasMonthlyInputAccess(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Monthly inputs available only for N0, N1, N2 and N3", 403);
  }

  const parsed = await parseBody(request, updatePlantMonthlyInputsInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  await prisma.$transaction([
    ...parsed.data.months.flatMap((entry) => {
      const monthlyInput = prisma.plantMonthlyInput.upsert({
        where: {
          plantId_year_month: {
            plantId: plant.id,
            year: parsed.data.year,
            month: entry.month,
          },
        },
        update: {
          workerCount: entry.workerCount,
          hoursWorked: entry.hoursWorked === null ? null : new Prisma.Decimal(entry.hoursWorked),
          standardHours: entry.standardHours === null ? null : new Prisma.Decimal(entry.standardHours),
          spillsNumber: entry.spillsNumber,
          energyConsumedMwh: toEnergyTotal(entry) === null ? null : new Prisma.Decimal(toEnergyTotal(entry)!),
          electricityFromGridMwh: entry.electricityFromGridMwh === null ? null : new Prisma.Decimal(entry.electricityFromGridMwh),
          selfProducedEnergyMwh: entry.selfProducedEnergyMwh === null ? null : new Prisma.Decimal(entry.selfProducedEnergyMwh),
          heatingM3: entry.heatingM3 === null ? null : new Prisma.Decimal(entry.heatingM3),
          waterConsumedNetworkM3: entry.waterConsumedNetworkM3 === null ? null : new Prisma.Decimal(entry.waterConsumedNetworkM3),
          waterConsumedCapturedM3: entry.waterConsumedCapturedM3 === null ? null : new Prisma.Decimal(entry.waterConsumedCapturedM3),
          compressedAirConsumedM3: entry.compressedAirConsumedM3 === null ? null : new Prisma.Decimal(entry.compressedAirConsumedM3),
          compressedAirConsumedMwh: entry.compressedAirConsumedMwh === null ? null : new Prisma.Decimal(entry.compressedAirConsumedMwh),
          nonHazardousWasteTons:
            toNonHazardousWasteTotal(entry) === null ? null : new Prisma.Decimal(toNonHazardousWasteTotal(entry)!),
          ewc150101PaperCardboardPackagingTons:
            entry.ewc150101PaperCardboardPackagingTons === null ? null : new Prisma.Decimal(entry.ewc150101PaperCardboardPackagingTons),
          ewc150102PlasticPackagingTons:
            entry.ewc150102PlasticPackagingTons === null ? null : new Prisma.Decimal(entry.ewc150102PlasticPackagingTons),
          ewc150103WoodTons: entry.ewc150103WoodTons === null ? null : new Prisma.Decimal(entry.ewc150103WoodTons),
          ewc160117FerrousMetalsTons:
            entry.ewc160117FerrousMetalsTons === null ? null : new Prisma.Decimal(entry.ewc160117FerrousMetalsTons),
          ewc160118NonFerrousMetalsCopperTons:
            entry.ewc160118NonFerrousMetalsCopperTons === null ? null : new Prisma.Decimal(entry.ewc160118NonFerrousMetalsCopperTons),
          ewc170117ConstructionWasteTons:
            entry.ewc170117ConstructionWasteTons === null ? null : new Prisma.Decimal(entry.ewc170117ConstructionWasteTons),
          ewc200111Tons: entry.ewc200111Tons === null ? null : new Prisma.Decimal(entry.ewc200111Tons),
          ewc200136ElectricalElectronicEquipmentTons:
            entry.ewc200136ElectricalElectronicEquipmentTons === null ? null : new Prisma.Decimal(entry.ewc200136ElectricalElectronicEquipmentTons),
          ewc200139PlasticTons: entry.ewc200139PlasticTons === null ? null : new Prisma.Decimal(entry.ewc200139PlasticTons),
          ewc200301UnsortedUrbanWasteTons:
            entry.ewc200301UnsortedUrbanWasteTons === null ? null : new Prisma.Decimal(entry.ewc200301UnsortedUrbanWasteTons),
          hazardousWasteTons: entry.hazardousWasteTons === null ? null : new Prisma.Decimal(entry.hazardousWasteTons),
          recycledWasteTons: entry.recycledWasteTons === null ? null : new Prisma.Decimal(entry.recycledWasteTons),
        },
        create: {
          plantId: plant.id,
          year: parsed.data.year,
          month: entry.month,
          workerCount: entry.workerCount,
          hoursWorked: entry.hoursWorked === null ? null : new Prisma.Decimal(entry.hoursWorked),
          standardHours: entry.standardHours === null ? null : new Prisma.Decimal(entry.standardHours),
          spillsNumber: entry.spillsNumber,
          energyConsumedMwh: toEnergyTotal(entry) === null ? null : new Prisma.Decimal(toEnergyTotal(entry)!),
          electricityFromGridMwh: entry.electricityFromGridMwh === null ? null : new Prisma.Decimal(entry.electricityFromGridMwh),
          selfProducedEnergyMwh: entry.selfProducedEnergyMwh === null ? null : new Prisma.Decimal(entry.selfProducedEnergyMwh),
          heatingM3: entry.heatingM3 === null ? null : new Prisma.Decimal(entry.heatingM3),
          waterConsumedNetworkM3: entry.waterConsumedNetworkM3 === null ? null : new Prisma.Decimal(entry.waterConsumedNetworkM3),
          waterConsumedCapturedM3: entry.waterConsumedCapturedM3 === null ? null : new Prisma.Decimal(entry.waterConsumedCapturedM3),
          compressedAirConsumedM3: entry.compressedAirConsumedM3 === null ? null : new Prisma.Decimal(entry.compressedAirConsumedM3),
          compressedAirConsumedMwh: entry.compressedAirConsumedMwh === null ? null : new Prisma.Decimal(entry.compressedAirConsumedMwh),
          nonHazardousWasteTons:
            toNonHazardousWasteTotal(entry) === null ? null : new Prisma.Decimal(toNonHazardousWasteTotal(entry)!),
          ewc150101PaperCardboardPackagingTons:
            entry.ewc150101PaperCardboardPackagingTons === null ? null : new Prisma.Decimal(entry.ewc150101PaperCardboardPackagingTons),
          ewc150102PlasticPackagingTons:
            entry.ewc150102PlasticPackagingTons === null ? null : new Prisma.Decimal(entry.ewc150102PlasticPackagingTons),
          ewc150103WoodTons: entry.ewc150103WoodTons === null ? null : new Prisma.Decimal(entry.ewc150103WoodTons),
          ewc160117FerrousMetalsTons:
            entry.ewc160117FerrousMetalsTons === null ? null : new Prisma.Decimal(entry.ewc160117FerrousMetalsTons),
          ewc160118NonFerrousMetalsCopperTons:
            entry.ewc160118NonFerrousMetalsCopperTons === null ? null : new Prisma.Decimal(entry.ewc160118NonFerrousMetalsCopperTons),
          ewc170117ConstructionWasteTons:
            entry.ewc170117ConstructionWasteTons === null ? null : new Prisma.Decimal(entry.ewc170117ConstructionWasteTons),
          ewc200111Tons: entry.ewc200111Tons === null ? null : new Prisma.Decimal(entry.ewc200111Tons),
          ewc200136ElectricalElectronicEquipmentTons:
            entry.ewc200136ElectricalElectronicEquipmentTons === null ? null : new Prisma.Decimal(entry.ewc200136ElectricalElectronicEquipmentTons),
          ewc200139PlasticTons: entry.ewc200139PlasticTons === null ? null : new Prisma.Decimal(entry.ewc200139PlasticTons),
          ewc200301UnsortedUrbanWasteTons:
            entry.ewc200301UnsortedUrbanWasteTons === null ? null : new Prisma.Decimal(entry.ewc200301UnsortedUrbanWasteTons),
          hazardousWasteTons: entry.hazardousWasteTons === null ? null : new Prisma.Decimal(entry.hazardousWasteTons),
          recycledWasteTons: entry.recycledWasteTons === null ? null : new Prisma.Decimal(entry.recycledWasteTons),
        },
      });

      const kpiInput = prisma.safetyKpiMonthlyInput.upsert({
        where: {
          plantId_year_month: {
            plantId: plant.id,
            year: parsed.data.year,
            month: entry.month,
          },
        },
        update: {
          hoursWorked: new Prisma.Decimal(entry.hoursWorked ?? 0),
        },
        create: {
          plantId: plant.id,
          year: parsed.data.year,
          month: entry.month,
          hoursWorked: new Prisma.Decimal(entry.hoursWorked ?? 0),
        },
      });

      return [monthlyInput, kpiInput];
    }),
    prisma.systemParameter.upsert({
      where: {
        plantId_key: {
          plantId: plant.id,
          key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        },
      },
      create: {
        plantId: plant.id,
        key: SYSTEM_PARAMETER_KEYS.MONTHLY_INPUTS_LAYOUT,
        valueJson: parsed.data.indicatorConfig as Prisma.InputJsonValue,
      },
      update: {
        valueJson: parsed.data.indicatorConfig as Prisma.InputJsonValue,
      },
    }),
    prisma.systemParameter.upsert({
      where: {
        plantId_key: {
          plantId: plant.id,
          key: monthlyCustomRowsKey(parsed.data.year),
        },
      },
      create: {
        plantId: plant.id,
        key: monthlyCustomRowsKey(parsed.data.year),
        valueJson: parsed.data.customRows as Prisma.InputJsonValue,
      },
      update: {
        valueJson: parsed.data.customRows as Prisma.InputJsonValue,
      },
    }),
  ]);

  return ok({ saved: true });
}
