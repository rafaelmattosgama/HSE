import { PrismaClient, CompetenceRequirementScope } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .trim();
}

async function main() {
  const plants = await prisma.plant.findMany({ select: { id: true, code: true } });
  let totalRulesConverted = 0;
  let totalRequirementsCreated = 0;
  const unconvertedRules: Array<{ plantCode: string; ruleId: string; scopeType: string }> = [];

  for (const plant of plants) {
    const [rules, workers, employeesByEmployeeNo, occupationalHealthByEmployeeNo] = await Promise.all([
      prisma.competenceRequirement.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.competenceWorker.findMany({
        where: { plantId: plant.id, isActive: true },
        include: { employee: { select: { employeeNo: true, dept: true } }, area: { select: { id: true, name: true } } },
      }),
      prisma.employeeDirectory.findMany({ where: { plantId: plant.id } })
        .then((rows) => new Map(rows.map((row) => [row.employeeNo, row]))),
      prisma.occupationalHealthWorker.findMany({ where: { plantId: plant.id } })
        .then((rows) => new Map(rows.map((row) => [row.employeeNo, row]))),
    ]);

    // (worker, competenceType) -> whether this rule set requires it, keyed to dedupe multiple matching rules.
    const toCreate = new Map<string, { competenceWorkerId: string; competenceTypeId: string }>();

    for (const rule of rules) {
      let matchedAny = false;

      for (const worker of workers) {
        let matches = false;

        if (rule.scopeType === CompetenceRequirementScope.ALL_WORKERS) {
          matches = true;
        } else if (rule.scopeType === CompetenceRequirementScope.ROLE && rule.scopeRoleName && worker.roleName) {
          matches = normalizeText(rule.scopeRoleName) === normalizeText(worker.roleName);
        } else if (rule.scopeType === CompetenceRequirementScope.AREA && rule.scopeAreaId) {
          if (worker.areaId) {
            matches = worker.areaId === rule.scopeAreaId;
          } else if (worker.employee.dept) {
            // Fallback: the worker has no areaId yet, but its free-text dept
            // might name the same department as the rule's Area — without
            // this fallback the backfill converts zero AREA rules, because
            // no worker has areaId filled in (that gap is the reason this
            // migration exists).
            const area = await prisma.area.findUnique({ where: { id: rule.scopeAreaId }, select: { name: true } });
            matches = Boolean(area && normalizeText(area.name) === normalizeText(worker.employee.dept));
          }
        } else if (rule.scopeType === CompetenceRequirementScope.WORKSTATION && rule.scopeWorkstationId) {
          const occupationalHealthWorker = occupationalHealthByEmployeeNo.get(worker.employee.employeeNo);
          matches = occupationalHealthWorker?.workstationId === rule.scopeWorkstationId;
        }

        if (matches) {
          matchedAny = true;
          toCreate.set(`${worker.id}:${rule.competenceTypeId}`, { competenceWorkerId: worker.id, competenceTypeId: rule.competenceTypeId });
        }
      }

      if (matchedAny) {
        totalRulesConverted += 1;
      } else {
        unconvertedRules.push({ plantCode: plant.code, ruleId: rule.id, scopeType: rule.scopeType });
      }
    }

    for (const entry of toCreate.values()) {
      await prisma.competenceWorkerRequirement.upsert({
        where: { competenceWorkerId_competenceTypeId: entry },
        update: {},
        create: { plantId: plant.id, ...entry, isRequired: true },
      });
      totalRequirementsCreated += 1;
    }

    console.log(`[${plant.code}] ${rules.length} active rule(s) -> ${toCreate.size} worker requirement(s)`);
  }

  console.log(`\nTotal: ${totalRulesConverted} rule(s) converted, ${totalRequirementsCreated} CompetenceWorkerRequirement row(s) created.`);
  if (unconvertedRules.length > 0) {
    console.log(`\n${unconvertedRules.length} rule(s) matched no worker at all:`);
    for (const entry of unconvertedRules) {
      console.log(`  - plant ${entry.plantCode}, rule ${entry.ruleId}, scope ${entry.scopeType}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
