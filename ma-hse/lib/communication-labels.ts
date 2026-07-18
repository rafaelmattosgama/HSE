import type { AppLocale } from "@/lib/i18n/routing";
import { normalizeUiLocale } from "@/lib/ui-language";

export type CommunicationTypeLabelMap = {
  UNSAFE_ACT: string;
  UNSAFE_CONDITION: string;
  NEAR_MISS: string;
  FIRST_AID: string;
  ACCIDENT: string;
  FIVE_S_IMPROVEMENT: string;
  IMPROVEMENT_SUGGESTION: string;
};

export type CommunicationImprovementSubtypeLabelMap = {
  FIVE_S_AREA_IMPROVEMENT: string;
  FIVE_S_DISORGANIZATION: string;
  IMPROVEMENT_SAFETY: string;
  IMPROVEMENT_HEALTH: string;
  IMPROVEMENT_ENVIRONMENT: string;
};

export const COMMUNICATION_TYPE_LABELS: Record<AppLocale, CommunicationTypeLabelMap> = {
  en: { UNSAFE_ACT: "Unsafe Act", UNSAFE_CONDITION: "Unsafe Condition", NEAR_MISS: "Near Miss", FIRST_AID: "First Aid", ACCIDENT: "Accident", FIVE_S_IMPROVEMENT: "5S Improvement", IMPROVEMENT_SUGGESTION: "Improvement Suggestion" },
  it: { UNSAFE_ACT: "Atto non sicuro", UNSAFE_CONDITION: "Condizione non sicura", NEAR_MISS: "Mancato infortunio", FIRST_AID: "Primo soccorso", ACCIDENT: "Infortunio", FIVE_S_IMPROVEMENT: "Miglioramento 5S", IMPROVEMENT_SUGGESTION: "Suggerimento di miglioramento" },
  pt: { UNSAFE_ACT: "Ato inseguro", UNSAFE_CONDITION: "Condição perigosa", NEAR_MISS: "Quase acidente", FIRST_AID: "Primeiros socorros", ACCIDENT: "Acidente", FIVE_S_IMPROVEMENT: "Melhoria 5S", IMPROVEMENT_SUGGESTION: "Sugestão de melhoria" },
  pl: { UNSAFE_ACT: "Niebezpieczne zachowanie", UNSAFE_CONDITION: "Niebezpieczny stan", NEAR_MISS: "Zdarzenie potencjalnie wypadkowe", FIRST_AID: "Pierwsza pomoc", ACCIDENT: "Wypadek", FIVE_S_IMPROVEMENT: "Usprawnienie 5S", IMPROVEMENT_SUGGESTION: "Sugestia usprawnienia" },
  de: { UNSAFE_ACT: "Unsichere Handlung", UNSAFE_CONDITION: "Unsicherer Zustand", NEAR_MISS: "Beinaheunfall", FIRST_AID: "Erste Hilfe", ACCIDENT: "Unfall", FIVE_S_IMPROVEMENT: "5S-Verbesserung", IMPROVEMENT_SUGGESTION: "Verbesserungsvorschlag" },
  ro: { UNSAFE_ACT: "Act nesigur", UNSAFE_CONDITION: "Condiție nesigură", NEAR_MISS: "Incident evitat", FIRST_AID: "Prim ajutor", ACCIDENT: "Accident", FIVE_S_IMPROVEMENT: "Îmbunătățire 5S", IMPROVEMENT_SUGGESTION: "Sugestie de îmbunătățire" },
  fr: { UNSAFE_ACT: "Acte dangereux", UNSAFE_CONDITION: "Situation dangereuse", NEAR_MISS: "Quasi-accident", FIRST_AID: "Premiers secours", ACCIDENT: "Accident", FIVE_S_IMPROVEMENT: "Amélioration 5S", IMPROVEMENT_SUGGESTION: "Suggestion d’amélioration" },
};

export const COMMUNICATION_IMPROVEMENT_SUBTYPE_LABELS: Record<AppLocale, CommunicationImprovementSubtypeLabelMap> = {
  en: { FIVE_S_AREA_IMPROVEMENT: "Area improvement", FIVE_S_DISORGANIZATION: "Disorganization", IMPROVEMENT_SAFETY: "Safety", IMPROVEMENT_HEALTH: "Health", IMPROVEMENT_ENVIRONMENT: "Environment" },
  it: { FIVE_S_AREA_IMPROVEMENT: "Miglioramento dell’area", FIVE_S_DISORGANIZATION: "Disorganizzazione", IMPROVEMENT_SAFETY: "Sicurezza", IMPROVEMENT_HEALTH: "Salute", IMPROVEMENT_ENVIRONMENT: "Ambiente" },
  pt: { FIVE_S_AREA_IMPROVEMENT: "Melhoria da área", FIVE_S_DISORGANIZATION: "Desorganização", IMPROVEMENT_SAFETY: "Segurança", IMPROVEMENT_HEALTH: "Saúde", IMPROVEMENT_ENVIRONMENT: "Ambiente" },
  pl: { FIVE_S_AREA_IMPROVEMENT: "Usprawnienie obszaru", FIVE_S_DISORGANIZATION: "Dezorganizacja", IMPROVEMENT_SAFETY: "Bezpieczeństwo", IMPROVEMENT_HEALTH: "Zdrowie", IMPROVEMENT_ENVIRONMENT: "Środowisko" },
  de: { FIVE_S_AREA_IMPROVEMENT: "Bereichsverbesserung", FIVE_S_DISORGANIZATION: "Unordnung", IMPROVEMENT_SAFETY: "Sicherheit", IMPROVEMENT_HEALTH: "Gesundheit", IMPROVEMENT_ENVIRONMENT: "Umwelt" },
  ro: { FIVE_S_AREA_IMPROVEMENT: "Îmbunătățirea zonei", FIVE_S_DISORGANIZATION: "Dezorganizare", IMPROVEMENT_SAFETY: "Siguranță", IMPROVEMENT_HEALTH: "Sănătate", IMPROVEMENT_ENVIRONMENT: "Mediu" },
  fr: { FIVE_S_AREA_IMPROVEMENT: "Amélioration de la zone", FIVE_S_DISORGANIZATION: "Désorganisation", IMPROVEMENT_SAFETY: "Sécurité", IMPROVEMENT_HEALTH: "Santé", IMPROVEMENT_ENVIRONMENT: "Environnement" },
};

export function getFixedCommunicationLabels(locale: string | null | undefined) {
  const normalizedLocale = normalizeUiLocale(locale) as AppLocale;
  return {
    communicationTypeLabels: COMMUNICATION_TYPE_LABELS[normalizedLocale],
    communicationImprovementSubtypeLabels: COMMUNICATION_IMPROVEMENT_SUBTYPE_LABELS[normalizedLocale],
  };
}
