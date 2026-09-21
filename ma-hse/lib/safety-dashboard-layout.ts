import { normalizeUiLocale } from "@/lib/ui-language";

const en = {
  overview: "Overview", wholePlant: "Whole plant", details: "Detailed indicators",
  communications: "Safety communications", moreRankings: "More rankings", charts: "Explore charts",
  base: "Base", countShare: "Count · share of classified records", percentage: "% of total",
  trend: "Trend", total: "communications", validated: "validated", pending: "pending validation",
  close: "Close", empty: "No communications in this scope.", view: "View communications",
};
type Copy = typeof en;
const copies: Record<string, Copy> = {
  en,
  pt: { overview: "Visão geral", wholePlant: "Toda a fábrica", details: "Indicadores detalhados", communications: "Comunicações de segurança", moreRankings: "Mais rankings", charts: "Explorar gráficos", base: "Base", countShare: "Quantidade · percentagem dos registos classificados", percentage: "% do total", trend: "Evolução", total: "comunicações", validated: "validadas", pending: "por validar", close: "Fechar", empty: "Sem comunicações neste âmbito.", view: "Ver comunicações" },
  it: { overview: "Panoramica", wholePlant: "Intero stabilimento", details: "Indicatori dettagliati", communications: "Segnalazioni di sicurezza", moreRankings: "Altre classifiche", charts: "Esplora grafici", base: "Base", countShare: "Quantità · percentuale dei record classificati", percentage: "% del totale", trend: "Andamento", total: "segnalazioni", validated: "convalidate", pending: "da convalidare", close: "Chiudi", empty: "Nessuna segnalazione in questo ambito.", view: "Visualizza segnalazioni" },
  de: { overview: "Übersicht", wholePlant: "Gesamtes Werk", details: "Detaillierte Kennzahlen", communications: "Sicherheitsmeldungen", moreRankings: "Weitere Ranglisten", charts: "Diagramme erkunden", base: "Basis", countShare: "Anzahl · Anteil klassifizierter Datensätze", percentage: "% der Gesamtzahl", trend: "Entwicklung", total: "Meldungen", validated: "validiert", pending: "zu validieren", close: "Schließen", empty: "Keine Meldungen in diesem Bereich.", view: "Meldungen anzeigen" },
  fr: { overview: "Vue d’ensemble", wholePlant: "Toute l’usine", details: "Indicateurs détaillés", communications: "Signalements de sécurité", moreRankings: "Autres classements", charts: "Explorer les graphiques", base: "Base", countShare: "Nombre · part des enregistrements classifiés", percentage: "% du total", trend: "Évolution", total: "signalements", validated: "validés", pending: "à valider", close: "Fermer", empty: "Aucun signalement dans ce périmètre.", view: "Voir les signalements" },
  pl: { overview: "Przegląd", wholePlant: "Cały zakład", details: "Szczegółowe wskaźniki", communications: "Zgłoszenia bezpieczeństwa", moreRankings: "Więcej rankingów", charts: "Przeglądaj wykresy", base: "Podstawa", countShare: "Liczba · udział sklasyfikowanych rekordów", percentage: "% całości", trend: "Trend", total: "zgłoszeń", validated: "zatwierdzonych", pending: "do zatwierdzenia", close: "Zamknij", empty: "Brak zgłoszeń w tym zakresie.", view: "Zobacz zgłoszenia" },
  ro: { overview: "Prezentare generală", wholePlant: "Întreaga fabrică", details: "Indicatori detaliați", communications: "Comunicări de securitate", moreRankings: "Mai multe clasamente", charts: "Explorează grafice", base: "Bază", countShare: "Număr · ponderea înregistrărilor clasificate", percentage: "% din total", trend: "Evoluție", total: "comunicări", validated: "validate", pending: "de validat", close: "Închide", empty: "Nu există comunicări în acest domeniu.", view: "Vezi comunicările" },
};
export function getSafetyDashboardLayoutCopy(locale: string): Copy {
  return copies[normalizeUiLocale(locale)] ?? en;
}
