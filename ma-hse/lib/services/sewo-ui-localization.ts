import {
  BASE_ROOT_CAUSE_GROUPS,
  BASE_SEWO_UI,
  getSifPsifInformationCopy,
  type RootCauseGroup,
  type SewoUi,
} from "@/lib/sewo-ui";
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

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringEntries(item, [...path, index], entries));
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

async function translateStructured<T>(locale: string, base: T): Promise<T> {
  if (locale === "en") {
    return JSON.parse(JSON.stringify(base)) as T;
  }

  const translated = JSON.parse(JSON.stringify(base)) as T;
  const entries = collectStringEntries(base);
  const translations = await translateForViewer(locale, entries.map((entry) => entry.value));

  entries.forEach((entry, index) => {
    setNestedString(translated, entry.path, translations[index] ?? entry.value);
  });

  return translated;
}

export async function getLocalizedSewoUi(locale: string): Promise<{
  ui: SewoUi;
  rootCauseGroups: RootCauseGroup[];
}> {
  const [ui, rootCauseGroups] = await Promise.all([
    translateStructured(locale, BASE_SEWO_UI),
    translateStructured(locale, BASE_ROOT_CAUSE_GROUPS),
  ]);

  return {
    ui: {
      ...ui,
      ...getSifPsifInformationCopy(locale),
      locale,
    } as SewoUi,
    rootCauseGroups,
  };
}
