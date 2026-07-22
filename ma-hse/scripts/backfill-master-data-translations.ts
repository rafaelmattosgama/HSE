import { MasterDataEntityType } from "@prisma/client";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { prisma } from "@/lib/prisma";
import { processMasterDataTranslations } from "@/lib/services/master-data-translation-service";

type BackfillOptions = {
  batchSize: number;
  plantCode?: string;
  entityType?: MasterDataEntityType;
  dryRun: boolean;
  redetectSourceLanguage: boolean;
};

function readOptions(): BackfillOptions {
  const values = new Map(
    process.argv.slice(2).map((argument) => {
      const [key, value = "true"] = argument.replace(/^--/, "").split("=", 2);
      return [key, value];
    }),
  );
  const batchSize = Number(values.get("batch-size") ?? 25);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
    throw new Error("--batch-size must be an integer between 1 and 200");
  }
  const rawEntityType = values.get("entity");
  const entityType = rawEntityType
    ? Object.values(MasterDataEntityType).find((value) => value === rawEntityType.toUpperCase())
    : undefined;
  if (rawEntityType && !entityType) {
    throw new Error(`Unsupported --entity value: ${rawEntityType}`);
  }
  return {
    batchSize,
    plantCode: values.get("plant"),
    entityType,
    dryRun: values.get("dry-run") === "true",
    redetectSourceLanguage: values.get("redetect-source-language") === "true",
  };
}

async function listBatch(
  entityType: MasterDataEntityType,
  options: BackfillOptions,
  cursor?: string,
) {
  const where = {
    ...(cursor ? { id: { gt: cursor } } : {}),
    ...(options.plantCode ? { plant: { code: options.plantCode } } : {}),
  };
  const query = { where, orderBy: { id: "asc" as const }, take: options.batchSize, select: { id: true } };
  if (entityType === MasterDataEntityType.AREA) return prisma.area.findMany(query);
  if (entityType === MasterDataEntityType.WORKSTATION) return prisma.workstation.findMany(query);
  if (entityType === MasterDataEntityType.EQUIPMENT) return prisma.equipment.findMany(query);
  return prisma.riskTheme.findMany(query);
}

const defaultRiskCodes = new Set(DEFAULT_PROFESSIONAL_RISKS.map((risk) => risk.code));

async function preserveKnownDefaultRiskLanguages(entityType: MasterDataEntityType, entityId: string) {
  if (entityType !== MasterDataEntityType.RISK_THEME) return;
  const risk = await prisma.riskTheme.findUnique({
    where: { id: entityId },
    select: { code: true, sourceLanguage: true, categorySourceLanguage: true },
  });
  if (!risk || !defaultRiskCodes.has(risk.code)) return;
  if (risk.sourceLanguage && risk.categorySourceLanguage) return;
  await prisma.riskTheme.update({
    where: { id: entityId },
    data: {
      sourceLanguage: risk.sourceLanguage ?? "pt",
      categorySourceLanguage: risk.categorySourceLanguage ?? "en",
    },
  });
}

async function clearSourceLanguageForRedetection(
  entityType: MasterDataEntityType,
  entityId: string,
) {
  if (entityType === MasterDataEntityType.AREA) {
    await prisma.area.update({ where: { id: entityId }, data: { sourceLanguage: null } });
  } else if (entityType === MasterDataEntityType.WORKSTATION) {
    await prisma.workstation.update({ where: { id: entityId }, data: { sourceLanguage: null } });
  } else if (entityType === MasterDataEntityType.EQUIPMENT) {
    await prisma.equipment.update({ where: { id: entityId }, data: { sourceLanguage: null } });
  } else {
    await prisma.riskTheme.update({
      where: { id: entityId },
      data: { sourceLanguage: null, categorySourceLanguage: null },
    });
  }
}

async function run() {
  const options = readOptions();
  const entityTypes = options.entityType
    ? [options.entityType]
    : Object.values(MasterDataEntityType);
  let processed = 0;
  let translated = 0;
  let errors = 0;

  for (const entityType of entityTypes) {
    let cursor: string | undefined;
    while (true) {
      const batch = await listBatch(entityType, options, cursor);
      if (!batch.length) break;
      cursor = batch.at(-1)?.id;

      if (!options.dryRun) {
        for (let index = 0; index < batch.length; index += 3) {
          const chunk = batch.slice(index, index + 3);
          const results = await Promise.allSettled(
            chunk.map(async (row) => {
              if (options.redetectSourceLanguage) {
                await clearSourceLanguageForRedetection(entityType, row.id);
              }
              await preserveKnownDefaultRiskLanguages(entityType, row.id);
              return processMasterDataTranslations({ entityType, entityId: row.id });
            }),
          );
          for (const result of results) {
            processed += 1;
            if (result.status === "fulfilled") {
              translated += result.value.translated;
            } else {
              errors += 1;
              console.error(JSON.stringify({ entityType, error: String(result.reason) }));
            }
          }
        }
      } else {
        processed += batch.length;
      }

      console.info(
        JSON.stringify({
          entityType,
          processed,
          translated,
          errors,
          cursor,
          dryRun: options.dryRun,
          redetectSourceLanguage: options.redetectSourceLanguage,
        }),
      );
    }
  }

  console.info(JSON.stringify({
    done: true,
    processed,
    translated,
    errors,
    dryRun: options.dryRun,
    redetectSourceLanguage: options.redetectSourceLanguage,
  }));
  if (errors > 0) process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
