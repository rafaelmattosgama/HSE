import { BASE_N0_MASTER_DATA_UI, getStaticN0MasterDataUi, type N0MasterDataUi } from "@/lib/master-data-ui";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

type PathSegment = string | number;

type StringEntry = {
  path: PathSegment[];
  value: string;
};

function collectStringEntries(value: unknown, path: PathSegment[] = [], entries: StringEntry[] = []) {
  if (typeof value === "string") {
    entries.push({ path, value });
    return entries;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      collectStringEntries(nestedValue, [...path, key], entries);
    }
  }

  return entries;
}

function setNestedString(target: unknown, path: PathSegment[], nextValue: string) {
  let cursor = target as Record<string | number, unknown>;

  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]] as Record<string | number, unknown>;
  }

  cursor[path[path.length - 1]] = nextValue;
}

export async function getLocalizedN0MasterDataUi(locale: string): Promise<N0MasterDataUi> {
  if (locale === "en") {
    return JSON.parse(JSON.stringify(BASE_N0_MASTER_DATA_UI)) as N0MasterDataUi;
  }

  if (locale === "pt") {
    return getStaticN0MasterDataUi(locale);
  }

  const translated = JSON.parse(JSON.stringify(BASE_N0_MASTER_DATA_UI)) as N0MasterDataUi;
  const entries = collectStringEntries(BASE_N0_MASTER_DATA_UI);
  const translations = await translateForViewer(locale, entries.map((entry) => entry.value));

  entries.forEach((entry, index) => {
    setNestedString(translated, entry.path, translations[index] ?? entry.value);
  });

  return translated;
}
