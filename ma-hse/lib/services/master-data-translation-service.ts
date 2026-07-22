import crypto from "node:crypto";
import {
  MasterDataEntityType,
  MasterDataTranslationField,
  MasterDataTranslationStatus,
  type Prisma,
} from "@prisma/client";
import { locales, type AppLocale } from "@/lib/i18n/routing";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getTranslationProvider } from "@/lib/services/translation-provider";
import { normalizeUiLocale } from "@/lib/ui-language";

export const MASTER_DATA_FALLBACK_LOCALE: AppLocale = "en";
export const MASTER_DATA_TRANSLATION_LOCALES = [...locales];

export type TranslatableMasterDataRow = {
  id: string;
  name: string;
  sourceLanguage?: string | null;
  category?: string | null;
  categorySourceLanguage?: string | null;
};

export type LocalizedMasterDataRow<T extends TranslatableMasterDataRow> = T & {
  originalName: string;
  localizedName: string;
  originalCategory?: string | null;
  localizedCategory?: string | null;
};

type TranslationValue = {
  entityId: string;
  field: MasterDataTranslationField;
  locale: string;
  value: string | null;
  status: MasterDataTranslationStatus;
};

type MasterDataSnapshot = {
  id: string;
  plantId: string;
  sourceLanguage: string | null;
  plantLanguage: string | null;
  fields: Array<{ field: MasterDataTranslationField; value: string; sourceLanguage?: string | null }>;
};

export function hashMasterDataSource(value: string) {
  return crypto.createHash("sha256").update(value.trim()).digest("hex");
}

export function normalizeMasterDataLocale(locale: string | null | undefined): AppLocale {
  return normalizeUiLocale(locale) as AppLocale;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function matchesMasterDataSearch(
  row: { originalName: string; localizedName: string; code?: string | null },
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return [row.originalName, row.localizedName, row.code ?? ""]
    .some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function translationKey(entityId: string, field: MasterDataTranslationField, locale: string) {
  return `${entityId}:${field}:${locale}`;
}

export function resolveLocalizedMasterDataField(input: {
  original: string;
  sourceLanguage?: string | null;
  targetLocale: string;
  targetTranslation?: string | null;
  fallbackTranslation?: string | null;
  fallbackLocale?: string;
}) {
  const targetLocale = normalizeMasterDataLocale(input.targetLocale);
  const sourceLanguage = input.sourceLanguage
    ? normalizeMasterDataLocale(input.sourceLanguage)
    : null;
  const fallbackLocale = normalizeMasterDataLocale(
    input.fallbackLocale ?? MASTER_DATA_FALLBACK_LOCALE,
  );

  if (input.targetTranslation?.trim()) return input.targetTranslation.trim();
  if (sourceLanguage === targetLocale) return input.original;
  if (input.fallbackTranslation?.trim()) return input.fallbackTranslation.trim();
  if (sourceLanguage === fallbackLocale) return input.original;
  return input.original;
}

function buildTranslationMap(translations: TranslationValue[]) {
  return new Map(
    translations
      .filter(
        (translation) =>
          translation.status === MasterDataTranslationStatus.COMPLETED &&
          Boolean(translation.value?.trim()),
      )
      .map((translation) => [
        translationKey(translation.entityId, translation.field, translation.locale),
        translation.value,
      ]),
  );
}

export function applyMasterDataTranslations<T extends TranslatableMasterDataRow>(input: {
  rows: T[];
  entityType: MasterDataEntityType;
  locale: string;
  translations: TranslationValue[];
}) {
  const locale = normalizeMasterDataLocale(input.locale);
  const translationMap = buildTranslationMap(input.translations);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });

  return input.rows
    .map((row): LocalizedMasterDataRow<T> => {
      const localizedName = resolveLocalizedMasterDataField({
        original: row.name,
        sourceLanguage: row.sourceLanguage,
        targetLocale: locale,
        targetTranslation: translationMap.get(
          translationKey(row.id, MasterDataTranslationField.NAME, locale),
        ),
        fallbackTranslation: translationMap.get(
          translationKey(row.id, MasterDataTranslationField.NAME, MASTER_DATA_FALLBACK_LOCALE),
        ),
      });
      const originalCategory = row.category;
      const localizedCategory = originalCategory
        ? resolveLocalizedMasterDataField({
            original: originalCategory,
            sourceLanguage: row.categorySourceLanguage ?? row.sourceLanguage,
            targetLocale: locale,
            targetTranslation: translationMap.get(
              translationKey(row.id, MasterDataTranslationField.CATEGORY, locale),
            ),
            fallbackTranslation: translationMap.get(
              translationKey(
                row.id,
                MasterDataTranslationField.CATEGORY,
                MASTER_DATA_FALLBACK_LOCALE,
              ),
            ),
          })
        : originalCategory;

      return {
        ...row,
        originalName: row.name,
        localizedName,
        name: localizedName,
        ...(Object.prototype.hasOwnProperty.call(row, "category")
          ? {
              originalCategory,
              localizedCategory,
              category: localizedCategory,
            }
          : {}),
      };
    })
    .sort(
      (left, right) =>
        collator.compare(left.localizedCategory ?? "", right.localizedCategory ?? "") ||
        collator.compare(left.localizedName, right.localizedName),
    );
}

export async function localizeMasterDataRows<T extends TranslatableMasterDataRow>(
  entityType: MasterDataEntityType,
  rows: T[],
  locale?: string | null,
) {
  if (rows.length === 0) return [] as LocalizedMasterDataRow<T>[];
  const targetLocale = normalizeMasterDataLocale(locale);
  const requestedLocales = Array.from(
    new Set([targetLocale, MASTER_DATA_FALLBACK_LOCALE]),
  );
  const translationDelegate = (prisma as typeof prisma & {
    masterDataTranslation?: typeof prisma.masterDataTranslation;
  }).masterDataTranslation;
  if (!translationDelegate) {
    return applyMasterDataTranslations({ rows, entityType, locale: targetLocale, translations: [] });
  }

  const translations = await translationDelegate.findMany({
    where: {
      entityType,
      entityId: { in: rows.map((row) => row.id) },
      locale: { in: requestedLocales },
      status: MasterDataTranslationStatus.COMPLETED,
    },
    select: {
      entityId: true,
      field: true,
      locale: true,
      value: true,
      status: true,
    },
  });

  return applyMasterDataTranslations({ rows, entityType, locale: targetLocale, translations });
}

async function getMasterDataSnapshot(
  entityType: MasterDataEntityType,
  entityId: string,
): Promise<MasterDataSnapshot | null> {
  if (entityType === MasterDataEntityType.AREA) {
    const row = await prisma.area.findUnique({
      where: { id: entityId },
      select: { id: true, plantId: true, name: true, sourceLanguage: true, plant: { select: { defaultLanguage: true } } },
    });
    return row
      ? { id: row.id, plantId: row.plantId, sourceLanguage: row.sourceLanguage, plantLanguage: row.plant.defaultLanguage, fields: [{ field: MasterDataTranslationField.NAME, value: row.name, sourceLanguage: row.sourceLanguage }] }
      : null;
  }
  if (entityType === MasterDataEntityType.WORKSTATION) {
    const row = await prisma.workstation.findUnique({
      where: { id: entityId },
      select: { id: true, plantId: true, name: true, sourceLanguage: true, plant: { select: { defaultLanguage: true } } },
    });
    return row
      ? { id: row.id, plantId: row.plantId, sourceLanguage: row.sourceLanguage, plantLanguage: row.plant.defaultLanguage, fields: [{ field: MasterDataTranslationField.NAME, value: row.name, sourceLanguage: row.sourceLanguage }] }
      : null;
  }
  if (entityType === MasterDataEntityType.EQUIPMENT) {
    const row = await prisma.equipment.findUnique({
      where: { id: entityId },
      select: { id: true, plantId: true, name: true, sourceLanguage: true, plant: { select: { defaultLanguage: true } } },
    });
    return row
      ? { id: row.id, plantId: row.plantId, sourceLanguage: row.sourceLanguage, plantLanguage: row.plant.defaultLanguage, fields: [{ field: MasterDataTranslationField.NAME, value: row.name, sourceLanguage: row.sourceLanguage }] }
      : null;
  }

  const row = await prisma.riskTheme.findUnique({
    where: { id: entityId },
    select: { id: true, plantId: true, name: true, category: true, sourceLanguage: true, categorySourceLanguage: true, plant: { select: { defaultLanguage: true } } },
  });
  return row
    ? {
        id: row.id,
        plantId: row.plantId,
        sourceLanguage: row.sourceLanguage,
        plantLanguage: row.plant.defaultLanguage,
        fields: [
          { field: MasterDataTranslationField.NAME, value: row.name, sourceLanguage: row.sourceLanguage },
          { field: MasterDataTranslationField.CATEGORY, value: row.category, sourceLanguage: row.categorySourceLanguage },
        ],
      }
    : null;
}

function isTechnicalReference(value: string) {
  const normalized = value.trim();
  return /^(?=.*\d)[A-Z0-9][A-Z0-9._/-]*$/.test(normalized);
}

export async function prepareMasterDataTranslations(input: {
  entityType: MasterDataEntityType;
  entityId: string;
}) {
  const snapshot = await getMasterDataSnapshot(input.entityType, input.entityId);
  if (!snapshot) return null;
  const sourceLanguage = snapshot.sourceLanguage
    ? normalizeMasterDataLocale(snapshot.sourceLanguage)
    : null;
  const existing = await prisma.masterDataTranslation.findMany({
    where: { entityType: input.entityType, entityId: input.entityId },
  });
  const existingByKey = new Map(
    existing.map((translation) => [
      `${translation.field}:${translation.locale}`,
      translation,
    ]),
  );
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const field of snapshot.fields) {
    const sourceHash = hashMasterDataSource(field.value);
    const fieldSourceLanguage = field.sourceLanguage
      ? normalizeMasterDataLocale(field.sourceLanguage)
      : null;
    for (const locale of MASTER_DATA_TRANSLATION_LOCALES) {
      const current = existingByKey.get(`${field.field}:${locale}`);
      if (current?.isManual) continue;
      const storesOriginal = locale === fieldSourceLanguage || isTechnicalReference(field.value);
      if (
        current?.sourceHash === sourceHash &&
        current.status === MasterDataTranslationStatus.COMPLETED &&
        current.value
      ) {
        continue;
      }
      if (
        current?.sourceHash === sourceHash &&
        !storesOriginal &&
        (current.status === MasterDataTranslationStatus.PENDING ||
          current.status === MasterDataTranslationStatus.FAILED)
      ) {
        continue;
      }

      operations.push(
        prisma.masterDataTranslation.upsert({
          where: {
            entityType_entityId_field_locale: {
              entityType: input.entityType,
              entityId: input.entityId,
              field: field.field,
              locale,
            },
          },
          create: {
            entityType: input.entityType,
            entityId: input.entityId,
            field: field.field,
            locale,
            value: storesOriginal ? field.value : null,
            sourceHash,
            status: storesOriginal
              ? MasterDataTranslationStatus.COMPLETED
              : MasterDataTranslationStatus.PENDING,
            translatedAt: storesOriginal ? new Date() : null,
          },
          update: {
            value: storesOriginal ? field.value : null,
            sourceHash,
            status: storesOriginal
              ? MasterDataTranslationStatus.COMPLETED
              : MasterDataTranslationStatus.PENDING,
            attempts: 0,
            lastError: null,
            translatedAt: storesOriginal ? new Date() : null,
          },
        }),
      );
    }
  }

  if (operations.length) await prisma.$transaction(operations);
  return { ...snapshot, sourceLanguage };
}

async function detectAndPersistMasterDataSourceLanguages(
  entityType: MasterDataEntityType,
  snapshot: MasterDataSnapshot,
) {
  const fieldsToDetect = snapshot.fields.filter(
    (field) => !field.sourceLanguage && !isTechnicalReference(field.value),
  );
  if (fieldsToDetect.length === 0) return false;

  let detectedLocales: Array<AppLocale | null>;
  try {
    detectedLocales = await getTranslationProvider().detectLocales(
      fieldsToDetect.map((field) => field.value),
    );
  } catch (error) {
    logger.warn(
      { err: error, entityId: snapshot.id },
      "failed to detect master data source language; translations will continue without a source hint",
    );
    return false;
  }

  const detectedByField = new Map(
    fieldsToDetect.map((field, index) => [field.field, detectedLocales[index] ?? null]),
  );
  const detectedNameLocale = detectedByField.get(MasterDataTranslationField.NAME) ?? null;
  const detectedCategoryLocale = detectedByField.get(MasterDataTranslationField.CATEGORY) ?? null;
  const detectedFields = fieldsToDetect
    .filter((field, index) => Boolean(detectedLocales[index]))
    .map((field) => field.field);

  if (!detectedNameLocale && !detectedCategoryLocale) return false;

  let sourceLanguageUpdate: Prisma.PrismaPromise<unknown>;
  if (entityType === MasterDataEntityType.RISK_THEME) {
    sourceLanguageUpdate = prisma.riskTheme.update({
      where: { id: snapshot.id },
      data: {
        ...(detectedNameLocale ? { sourceLanguage: detectedNameLocale } : {}),
        ...(detectedCategoryLocale ? { categorySourceLanguage: detectedCategoryLocale } : {}),
      },
    });
  } else {
    if (!detectedNameLocale) return false;
    const data = { sourceLanguage: detectedNameLocale };
    if (entityType === MasterDataEntityType.AREA) {
      sourceLanguageUpdate = prisma.area.update({ where: { id: snapshot.id }, data });
    } else if (entityType === MasterDataEntityType.WORKSTATION) {
      sourceLanguageUpdate = prisma.workstation.update({ where: { id: snapshot.id }, data });
    } else {
      sourceLanguageUpdate = prisma.equipment.update({ where: { id: snapshot.id }, data });
    }
  }

  await prisma.$transaction([
    sourceLanguageUpdate,
    prisma.masterDataTranslation.updateMany({
      where: {
        entityType,
        entityId: snapshot.id,
        field: { in: detectedFields },
        isManual: false,
      },
      data: {
        value: null,
        status: MasterDataTranslationStatus.PENDING,
        attempts: 0,
        lastError: null,
        translatedAt: null,
      },
    }),
  ]);
  return true;
}

export async function processMasterDataTranslations(input: {
  entityType: MasterDataEntityType;
  entityId: string;
}) {
  let snapshot = await prepareMasterDataTranslations(input);
  if (!snapshot) return { translated: 0, skipped: 0 };

  if (await detectAndPersistMasterDataSourceLanguages(input.entityType, snapshot)) {
    snapshot = (await prepareMasterDataTranslations(input)) ?? snapshot;
  }

  const pending = await prisma.masterDataTranslation.findMany({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      isManual: false,
      status: { in: [MasterDataTranslationStatus.PENDING, MasterDataTranslationStatus.FAILED] },
    },
    orderBy: [{ locale: "asc" }, { field: "asc" }],
  });
  const sourceByField = new Map(snapshot.fields.map((field) => [field.field, field.value]));
  const byLocale = new Map<string, typeof pending>();
  for (const translation of pending) {
    const rows = byLocale.get(translation.locale) ?? [];
    rows.push(translation);
    byLocale.set(translation.locale, rows);
  }

  let translated = 0;
  const errors: Error[] = [];
  for (const [locale, rows] of byLocale) {
    const sourceTexts = rows.map((row) => sourceByField.get(row.field) ?? "");
    try {
      const values = await getTranslationProvider().translateBatch({
        targetLocale: locale,
        texts: sourceTexts,
        purpose: "master-data",
      });
      await prisma.$transaction(
        rows.map((row, index) =>
          prisma.masterDataTranslation.update({
            where: { id: row.id },
            data: {
              value: values[index] || sourceTexts[index],
              status: MasterDataTranslationStatus.COMPLETED,
              attempts: { increment: 1 },
              lastError: null,
              translatedAt: new Date(),
            },
          }),
        ),
      );
      translated += rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Translation failed";
      await prisma.$transaction(
        rows.map((row) =>
          prisma.masterDataTranslation.update({
            where: { id: row.id },
            data: {
              status: MasterDataTranslationStatus.FAILED,
              attempts: { increment: 1 },
              lastError: message,
            },
          }),
        ),
      );
      errors.push(error instanceof Error ? error : new Error(message));
    }
  }

  if (errors.length) {
    throw new AggregateError(errors, `Failed to translate ${input.entityType} ${input.entityId}`);
  }
  return { translated, skipped: snapshot.fields.length * locales.length - translated };
}

export async function scheduleMasterDataTranslations(input: {
  entityType: MasterDataEntityType;
  entityId: string;
}) {
  let sourceVersion = "current";
  try {
    const prepared = await prepareMasterDataTranslations(input);
    if (prepared) {
      sourceVersion = hashMasterDataSource(
        prepared.fields.map((field) => `${field.field}:${field.value}`).join("\n"),
      ).slice(0, 16);
    }
  } catch (error) {
    logger.error({ err: error, ...input }, "failed to prepare master data translations");
    return false;
  }

  const enqueue = import("@/jobs/queues")
    .then(({ masterDataTranslationQueue }) =>
      masterDataTranslationQueue.add("translate-master-data", input, {
        jobId: `master-data-${input.entityType.toLowerCase()}-${input.entityId}-${sourceVersion}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      }),
    )
    .then(() => true)
    .catch((error) => {
      logger.warn({ err: error, ...input }, "master data translation queued state retained for retry");
      return false;
    });
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), 750));
  return Promise.race([enqueue, timeout]);
}

export async function saveManualMasterDataTranslation(input: {
  entityType: MasterDataEntityType;
  entityId: string;
  field: MasterDataTranslationField;
  locale: string;
  value: string;
}) {
  const snapshot = await getMasterDataSnapshot(input.entityType, input.entityId);
  if (!snapshot) return null;
  const source = snapshot.fields.find((field) => field.field === input.field);
  if (!source) return null;
  const locale = normalizeMasterDataLocale(input.locale);
  return prisma.masterDataTranslation.upsert({
    where: {
      entityType_entityId_field_locale: {
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
        locale,
      },
    },
    create: {
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      locale,
      value: input.value.trim(),
      sourceHash: hashMasterDataSource(source.value),
      status: MasterDataTranslationStatus.COMPLETED,
      isManual: true,
      translatedAt: new Date(),
    },
    update: {
      value: input.value.trim(),
      sourceHash: hashMasterDataSource(source.value),
      status: MasterDataTranslationStatus.COMPLETED,
      isManual: true,
      lastError: null,
      translatedAt: new Date(),
    },
  });
}

export async function getMasterDataTranslationState(input: {
  entityType: MasterDataEntityType;
  entityId: string;
}) {
  const snapshot = await getMasterDataSnapshot(input.entityType, input.entityId);
  if (!snapshot) return null;
  const translations = await prisma.masterDataTranslation.findMany({
    where: { entityType: input.entityType, entityId: input.entityId },
    orderBy: [{ field: "asc" }, { locale: "asc" }],
  });
  return { snapshot, translations };
}
