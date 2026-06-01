import { translateForViewer } from "@/lib/services/viewer-translation-service";
import {
  getFixedLocalizedCatalogCategory,
  getFixedLocalizedCatalogName,
} from "@/lib/services/communication-catalog-dictionaries";

type LocalizableRow = {
  name: string;
  code?: string | null;
};

type LocalizableCategorizedRow = LocalizableRow & {
  category?: string | null;
};

function sortByLocalizedName<T extends LocalizableRow>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      (left.code ?? "").localeCompare(right.code ?? ""),
  );
}

function sortByLocalizedCategory<T extends LocalizableCategorizedRow>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      (left.category ?? "").localeCompare(right.category ?? "") ||
      left.name.localeCompare(right.name) ||
      (left.code ?? "").localeCompare(right.code ?? ""),
  );
}

export async function localizeCommunicationCatalogRows<T extends LocalizableRow>(
  rows: T[],
  locale: string,
) {
  if (rows.length === 0) return rows;

  const fixedNames = rows.map((row) => getFixedLocalizedCatalogName(row.code, locale));
  const namesToTranslate = rows.map((row, index) => fixedNames[index] ?? row.name);
  const translatedNames = locale === "pt"
    ? namesToTranslate
    : await translateForViewer(locale, namesToTranslate);

  return sortByLocalizedName(
    rows.map((row, index) => ({
      ...row,
      name: translatedNames[index] ?? fixedNames[index] ?? row.name,
    })),
  );
}

export async function localizeCommunicationCategorizedCatalogRows<
  T extends LocalizableCategorizedRow,
>(rows: T[], locale: string) {
  if (rows.length === 0) return rows;

  const fixedNames = rows.map((row) => getFixedLocalizedCatalogName(row.code, locale));
  const fixedCategories = rows.map((row) => getFixedLocalizedCatalogCategory(row.category, locale));
  const [translatedNames, translatedCategories] = await Promise.all([
    locale === "pt"
      ? Promise.resolve(rows.map((row, index) => fixedNames[index] ?? row.name))
      : translateForViewer(
          locale,
          rows.map((row, index) => fixedNames[index] ?? row.name),
        ),
    locale === "pt"
      ? Promise.resolve(rows.map((row, index) => fixedCategories[index] ?? row.category ?? ""))
      : translateForViewer(
          locale,
          rows.map((row, index) => fixedCategories[index] ?? row.category ?? ""),
        ),
  ]);

  return sortByLocalizedCategory(
    rows.map((row, index) => ({
      ...row,
      name: translatedNames[index] ?? fixedNames[index] ?? row.name,
      category: row.category ? translatedCategories[index] ?? fixedCategories[index] ?? row.category : row.category,
    })),
  );
}
