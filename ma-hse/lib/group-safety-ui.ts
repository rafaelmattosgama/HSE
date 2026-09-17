const en = {
  executive: "Executive summary", operational: "Operational control", risk: "Risk view",
  view: "Dashboard view", scope: "Scope", group: "Group", search: "Search plants by name", noPlants: "No authorized plants in this scope.", noMatches: "No matching plants.", invalidScope: "This plant is unavailable in your authorized scope. Select Group or an available plant.",
  overview: "Safety at a glance", attention: "Needs attention", improved: "Improved", increased: "Increased", decreased: "Decreased", unchanged: "Unchanged", noComparison: "No comparable prior-year data", previous: "Same period last year", zeroBaseline: "Prior period was zero; absolute change shown",
  updated: "Source data updated", loaded: "Snapshot loaded", days: "days", events: "events", perMillion: "events / 1,000,000 h", gravityUnit: "lost days / 1,000,000 h",
  frequency: "Accident frequency rate", gravity: "Accident severity rate", firstAidRate: "First-aid frequency rate", nearMissRate: "Near-miss frequency rate", accidents: "Accidents", nearMisses: "Near misses", firstAids: "First aids",
  currentDays: "Days without accidents", latestAccident: "Latest accident", groupRecord: "Scope record", plantRecord: "Highest individual plant record", bestCurrent: "Plant with most days without accidents", since: "Since", highest: "Highest", lowest: "Lowest", plantDetail: "Open plant dashboard",
  historicalNote: "Current counters are as of the snapshot date, independent of the period filter. The group record uses the combined accident timeline from the common observation start; individual manual records cannot establish a group record.",
  noAccidentNote: "No known accident: counter starts at the common observation start.",
  countRule: "Unique communications with VALID_OPEN, ONGOING or CLOSED status, by event date. Zero means no eligible records in the selected period.",
  hoursNote: "Rates use total eligible events (or stored lost days) ÷ total positive worked hours × 1,000,000. Hours cover whole monthly inputs, including months intersecting a custom date range; no daily proration.",
  missingHours: "Missing or incomplete worked hours", partialRates: "Available-hours denominator: rates may be incomplete. Plants with no positive hours are excluded from rate rankings.",
  noTarget: "No target configured for this dashboard.", monthlyEvents: "Monthly event evolution", monthlyRates: "Monthly frequency and severity", period: "Period", month: "Month", values: "Show monthly values", partialMonth: "Current month / partial",
  rankings: "Plant comparisons", rankNote: "Counts include every plant in scope; frequency rankings require positive worked hours. Ties are ordered by plant name.",
  rootsNearMiss: "Near-miss root causes", rootsInjury: "Accident and first-aid root causes", rootsNote: "Multiple root-cause classifications per S-EWO analysis. Percentages use all named root-cause classifications in this category, not unique events. Period follows analysis date; existing analysis-status rules are preserved.",
  analyses: "analyses", classifications: "classifications", unclassifiedAnalyses: "Analyses outside these categories or without a linked event", typeNote: "Unique eligible events, at most one type per event. Percentages use all eligible events of this type, including those without a classification.", unclassified: "Without classification",
  pyramidNote: "Layer width is fixed: severity and event type, not volume. Counts also include SUBMITTED and PENDING_VALIDATION; pending records may enter by report date. Percentages use the total communications displayed across the seven levels.", pyramidUnclassified: "Accidents without an existing pyramid severity classification",
  operationalAlerts: "Operational priorities", overdueActions: "Overdue open actions", highPriorityActions: "High-priority open actions", actionsNote: "Current backlog, independent of the selected event period.",
  recordBasis: "Observation / historical baseline start", methodology: "Definitions and data coverage", noData: "No data", loading: "Loading group dashboard", error: "The group dashboard could not be loaded.", retry: "Try again", safety: "Safety", environment: "Environment",
};

export type GroupSafetyLabels = { [K in keyof typeof en]: string };
const pt: GroupSafetyLabels = {
  executive: "Resumo executivo", operational: "Controlo operacional", risk: "Visão de risco",
  view: "Vista do dashboard", scope: "Âmbito", group: "Grupo", search: "Pesquisar fábrica por nome", noPlants: "Sem fábricas autorizadas neste âmbito.", noMatches: "Nenhuma fábrica encontrada.", invalidScope: "Esta fábrica não está disponível no seu âmbito autorizado. Selecione Grupo ou uma fábrica disponível.",
  overview: "Estado global de Segurança", attention: "Atenção", improved: "Melhoria", increased: "Aumento", decreased: "Redução", unchanged: "Sem alteração", noComparison: "Sem dados homólogos comparáveis", previous: "Período homólogo", zeroBaseline: "Período anterior a zero; apresentada variação absoluta",
  updated: "Dados de origem atualizados", loaded: "Dados consultados em", days: "dias", events: "eventos", perMillion: "eventos / 1 000 000 h", gravityUnit: "dias perdidos / 1 000 000 h",
  frequency: "IF de acidentes de trabalho", gravity: "Índice de gravidade", firstAidRate: "IF de primeiros socorros", nearMissRate: "IF de quase acidentes", accidents: "Acidentes", nearMisses: "Quase acidentes", firstAids: "Primeiros socorros",
  currentDays: "Dias sem acidentes", latestAccident: "Último acidente", groupRecord: "Record do âmbito", plantRecord: "Maior record histórico por fábrica", bestCurrent: "Fábrica com mais dias sem acidentes", since: "Desde", highest: "Maior", lowest: "Menor", plantDetail: "Abrir dashboard da fábrica",
  historicalNote: "Os contadores atuais referem-se à data da consulta e não dependem do filtro de período. O record do Grupo usa a sequência conjunta de acidentes desde o início de observação comum; records manuais individuais não comprovam um record do Grupo.",
  noAccidentNote: "Sem acidente conhecido: contador desde o início de observação comum.",
  countRule: "Comunicações únicas em estado VALID_OPEN, ONGOING ou CLOSED, pela data do evento. Zero significa ausência de registos elegíveis no período selecionado.",
  hoursNote: "Índices = total de eventos elegíveis (ou dias perdidos registados) ÷ total de horas trabalhadas positivas × 1 000 000. As horas abrangem os registos mensais completos, incluindo meses intercetados por um intervalo de datas; sem rateio diário.",
  missingHours: "Horas trabalhadas em falta ou incompletas", partialRates: "Denominador com as horas disponíveis: os índices podem estar incompletos. Fábricas sem horas positivas são excluídas dos rankings de índices.",
  noTarget: "Sem meta configurada para este dashboard.", monthlyEvents: "Evolução mensal de eventos", monthlyRates: "Evolução de frequência e gravidade", period: "Período", month: "Mês", values: "Ver valores mensais", partialMonth: "Mês atual / parcial",
  rankings: "Comparação entre fábricas", rankNote: "Contagens incluem todas as fábricas do âmbito; rankings de frequência exigem horas positivas. Empates ordenados por nome de fábrica.",
  rootsNearMiss: "Causas-raiz de quase acidentes", rootsInjury: "Causas-raiz de acidentes e primeiros socorros", rootsNote: "Classificações múltiplas de causa-raiz por análise S-EWO. Percentagens sobre todas as classificações com nome nesta categoria, não sobre eventos únicos. Período pela data da análise; mantidas as regras atuais de estado das análises.",
  analyses: "análises", classifications: "classificações", unclassifiedAnalyses: "Análises fora destas categorias ou sem evento associado", typeNote: "Eventos elegíveis únicos, no máximo um tipo por evento. Percentagens sobre todos os eventos elegíveis desta tipologia, incluindo os não classificados.", unclassified: "Sem classificação",
  pyramidNote: "Largura fixa dos níveis: gravidade e tipologia, não volume. Contagens incluem também SUBMITTED e PENDING_VALIDATION; registos em validação podem entrar pela data de comunicação. Percentagens sobre o total de comunicações apresentado nos sete níveis.", pyramidUnclassified: "Acidentes sem classificação de gravidade nos níveis atuais da pirâmide",
  operationalAlerts: "Prioridades operacionais", overdueActions: "Ações abertas em atraso", highPriorityActions: "Ações abertas de prioridade alta", actionsNote: "Pendências atuais, independentes do período dos eventos selecionado.",
  recordBasis: "Início da observação / referência histórica", methodology: "Definições e cobertura dos dados", noData: "Sem dados", loading: "A carregar dashboard do Grupo", error: "Não foi possível carregar o dashboard do Grupo.", retry: "Tentar novamente", safety: "Segurança", environment: "Ambiente",
};

// The UI dictionary already falls back to English for untranslated explanatory copy.
export const GROUP_SAFETY_LABELS = {
  en, pt,
  it: { ...en, executive: "Riepilogo esecutivo", operational: "Controllo operativo", risk: "Visione del rischio", view: "Vista dashboard", scope: "Ambito", group: "Gruppo", search: "Cerca stabilimento per nome", safety: "Sicurezza", environment: "Ambiente", noData: "Nessun dato" },
  pl: { ...en, executive: "Podsumowanie zarządcze", operational: "Kontrola operacyjna", risk: "Widok ryzyka", view: "Widok pulpitu", scope: "Zakres", group: "Grupa", search: "Szukaj zakładu według nazwy", safety: "Bezpieczeństwo", environment: "Środowisko", noData: "Brak danych" },
  de: { ...en, executive: "Managementübersicht", operational: "Operative Steuerung", risk: "Risikoübersicht", view: "Dashboard-Ansicht", scope: "Umfang", group: "Gruppe", search: "Werk nach Namen suchen", safety: "Sicherheit", environment: "Umwelt", noData: "Keine Daten" },
  ro: { ...en, executive: "Rezumat executiv", operational: "Control operațional", risk: "Perspectivă asupra riscurilor", view: "Vizualizare tablou", scope: "Domeniu", group: "Grup", search: "Caută fabrica după nume", safety: "Siguranță", environment: "Mediu", noData: "Fără date" },
  fr: { ...en, executive: "Synthèse exécutive", operational: "Contrôle opérationnel", risk: "Vue des risques", view: "Vue du tableau de bord", scope: "Périmètre", group: "Groupe", search: "Rechercher une usine par nom", safety: "Sécurité", environment: "Environnement", noData: "Aucune donnée" },
} satisfies Record<string, GroupSafetyLabels>;
