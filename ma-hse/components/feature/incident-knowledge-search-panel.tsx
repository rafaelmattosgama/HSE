"use client";

import { FormEvent, useState } from "react";

type SearchResult = {
  documentId: string;
  sourceType: string;
  plantCode: string;
  plantName: string;
  incidentCode: string | null;
  incidentDate: string | null;
  incidentType: string | null;
  department: string | null;
  equipment: string | null;
  relevance: number;
  relevanceSources: string[];
  summary: string;
  excerpts: Array<{ text: string; page: number | null }>;
  causes: Array<{ code: string | null; label: string | null; category: string | null; description: string | null; assessmentStatus: "CONFIRMED" | "REJECTED" | "UNCERTAIN"; page: number | null }>;
  actions: Array<{ description: string | null; type: string | null; status: string; plannedDate: string | null; actualDate: string | null; page: number | null }>;
};

const COPY: Record<string, Record<string, string>> = {
  en: { title: "Search historical incidents", subtitle: "Search approved reports by meaning, wording or incident details.", query: "Describe the incident, mechanism, cause or action", from: "From", to: "To", type: "Occurrence type", department: "Department", equipment: "Equipment", cause: "Confirmed root cause category or code", search: "Search", searching: "Searching…", empty: "No approved incidents match these terms and filters.", open: "Open record", rank: "Relative relevance", rankNote: "Ranking for this search, not a probability.", page: "Page", causes: "Causes recorded", actions: "Documented actions", confirmed: "Confirmed root cause", rejected: "Analysed, not confirmed", uncertain: "Uncertain", planned: "Planned", inProgress: "In progress", completed: "Completed (confirmed)", cancelled: "Cancelled", unknown: "Status unknown", plannedDate: "Planned", actualDate: "Actual completion", noCause: "No root causes recorded.", noAction: "No actions recorded.", disclaimer: "Similarity does not prove that two incidents share a root cause.", requestError: "Incident search could not be completed." },
  pt: { title: "Pesquisar ocorrências históricas", subtitle: "Pesquisa relatórios aprovados por significado, texto ou dados da ocorrência.", query: "Descreva a ocorrência, mecanismo, causa ou ação", from: "De", to: "Até", type: "Tipo de ocorrência", department: "Departamento", equipment: "Equipamento", cause: "Categoria ou código de causa confirmada", search: "Pesquisar", searching: "A pesquisar…", empty: "Não foram encontradas ocorrências aprovadas para estes termos e filtros.", open: "Abrir ficha", rank: "Relevância relativa", rankNote: "Posição nesta pesquisa, não uma probabilidade.", page: "Página", causes: "Causas registadas", actions: "Ações documentadas", confirmed: "Causa raiz confirmada", rejected: "Analisada, não confirmada", uncertain: "Incerta", planned: "Planeada", inProgress: "Em curso", completed: "Concluída (confirmada)", cancelled: "Cancelada", unknown: "Estado desconhecido", plannedDate: "Planeada", actualDate: "Conclusão real", noCause: "Sem causas raiz registadas.", noAction: "Sem ações registadas.", disclaimer: "A semelhança não prova que duas ocorrências tenham a mesma causa raiz.", requestError: "Não foi possível concluir a pesquisa de ocorrências." },
  es: { title: "Buscar incidentes históricos", subtitle: "Busque informes aprobados por significado, texto o datos del incidente.", query: "Describa el incidente, mecanismo, causa o acción", from: "Desde", to: "Hasta", type: "Tipo de incidente", department: "Departamento", equipment: "Equipo", cause: "Categoría o código de causa confirmada", search: "Buscar", searching: "Buscando…", empty: "No se encontraron incidentes aprobados con estos términos y filtros.", open: "Abrir ficha", rank: "Relevancia relativa", rankNote: "Posición en esta búsqueda, no una probabilidad.", page: "Página", causes: "Causas registradas", actions: "Acciones documentadas", confirmed: "Causa raíz confirmada", rejected: "Analizada, no confirmada", uncertain: "Incierta", planned: "Planificada", inProgress: "En curso", completed: "Completada (confirmada)", cancelled: "Cancelada", unknown: "Estado desconocido", plannedDate: "Planificada", actualDate: "Cierre real", noCause: "No hay causas raíz registradas.", noAction: "No hay acciones registradas.", disclaimer: "La similitud no demuestra que dos incidentes compartan una causa raíz.", requestError: "No se pudo completar la búsqueda de incidentes." },
  fr: { title: "Rechercher des incidents historiques", subtitle: "Recherchez dans les rapports approuvés par sens, texte ou détails.", query: "Décrivez l’incident, le mécanisme, la cause ou l’action", from: "Du", to: "Au", type: "Type d’incident", department: "Département", equipment: "Équipement", cause: "Catégorie ou code de cause confirmée", search: "Rechercher", searching: "Recherche…", empty: "Aucun incident approuvé ne correspond à ces critères.", open: "Ouvrir la fiche", rank: "Pertinence relative", rankNote: "Classement de cette recherche, pas une probabilité.", page: "Page", causes: "Causes enregistrées", actions: "Actions documentées", confirmed: "Cause racine confirmée", rejected: "Analysée, non confirmée", uncertain: "Incertaine", planned: "Prévue", inProgress: "En cours", completed: "Terminée (confirmée)", cancelled: "Annulée", unknown: "Statut inconnu", plannedDate: "Prévue", actualDate: "Achèvement réel", noCause: "Aucune cause racine enregistrée.", noAction: "Aucune action enregistrée.", disclaimer: "La similarité ne prouve pas que deux incidents partagent la même cause racine.", requestError: "La recherche d’incidents a échoué." },
  it: { title: "Cerca incidenti storici", subtitle: "Cerca nei rapporti approvati per significato, testo o dettagli.", query: "Descrivi l’incidente, il meccanismo, la causa o l’azione", from: "Da", to: "A", type: "Tipo di incidente", department: "Reparto", equipment: "Attrezzatura", cause: "Categoria o codice della causa confermata", search: "Cerca", searching: "Ricerca…", empty: "Nessun incidente approvato corrisponde ai criteri.", open: "Apri scheda", rank: "Rilevanza relativa", rankNote: "Posizione in questa ricerca, non una probabilità.", page: "Pagina", causes: "Cause registrate", actions: "Azioni documentate", confirmed: "Causa radice confermata", rejected: "Analizzata, non confermata", uncertain: "Incerta", planned: "Pianificata", inProgress: "In corso", completed: "Completata (confermata)", cancelled: "Annullata", unknown: "Stato sconosciuto", plannedDate: "Pianificata", actualDate: "Completamento effettivo", noCause: "Nessuna causa radice registrata.", noAction: "Nessuna azione registrata.", disclaimer: "La somiglianza non dimostra che due incidenti abbiano la stessa causa radice.", requestError: "Ricerca incidenti non riuscita." },
  de: { title: "Historische Vorfälle suchen", subtitle: "Freigegebene Berichte nach Bedeutung, Text oder Details durchsuchen.", query: "Vorfall, Mechanismus, Ursache oder Maßnahme beschreiben", from: "Von", to: "Bis", type: "Vorfalltyp", department: "Abteilung", equipment: "Anlage", cause: "Kategorie oder Code der bestätigten Ursache", search: "Suchen", searching: "Suche…", empty: "Keine freigegebenen Vorfälle für diese Kriterien gefunden.", open: "Datensatz öffnen", rank: "Relative Relevanz", rankNote: "Rang in dieser Suche, keine Wahrscheinlichkeit.", page: "Seite", causes: "Erfasste Ursachen", actions: "Dokumentierte Maßnahmen", confirmed: "Bestätigte Grundursache", rejected: "Geprüft, nicht bestätigt", uncertain: "Unsicher", planned: "Geplant", inProgress: "In Bearbeitung", completed: "Abgeschlossen (bestätigt)", cancelled: "Abgebrochen", unknown: "Status unbekannt", plannedDate: "Geplant", actualDate: "Tatsächlicher Abschluss", noCause: "Keine Grundursachen erfasst.", noAction: "Keine Maßnahmen erfasst.", disclaimer: "Ähnlichkeit beweist keine gemeinsame Grundursache.", requestError: "Die Suche konnte nicht abgeschlossen werden." },
  pl: { title: "Szukaj historycznych zdarzeń", subtitle: "Szukaj w zatwierdzonych raportach według znaczenia, tekstu lub szczegółów.", query: "Opisz zdarzenie, mechanizm, przyczynę lub działanie", from: "Od", to: "Do", type: "Typ zdarzenia", department: "Dział", equipment: "Urządzenie", cause: "Kategoria lub kod potwierdzonej przyczyny", search: "Szukaj", searching: "Wyszukiwanie…", empty: "Nie znaleziono zatwierdzonych zdarzeń dla tych kryteriów.", open: "Otwórz wpis", rank: "Względna trafność", rankNote: "Pozycja w tym wyszukiwaniu, nie prawdopodobieństwo.", page: "Strona", causes: "Zapisane przyczyny", actions: "Udokumentowane działania", confirmed: "Potwierdzona przyczyna źródłowa", rejected: "Przeanalizowana, niepotwierdzona", uncertain: "Niepewna", planned: "Zaplanowana", inProgress: "W toku", completed: "Zakończona (potwierdzona)", cancelled: "Anulowana", unknown: "Nieznany status", plannedDate: "Planowana", actualDate: "Rzeczywiste zakończenie", noCause: "Brak zapisanych przyczyn.", noAction: "Brak zapisanych działań.", disclaimer: "Podobieństwo nie dowodzi wspólnej przyczyny źródłowej.", requestError: "Nie udało się wykonać wyszukiwania." },
  ro: { title: "Caută incidente istorice", subtitle: "Caută în rapoartele aprobate după sens, text sau detalii.", query: "Descrie incidentul, mecanismul, cauza sau acțiunea", from: "De la", to: "Până la", type: "Tipul incidentului", department: "Departament", equipment: "Echipament", cause: "Categorie sau cod al cauzei confirmate", search: "Caută", searching: "Se caută…", empty: "Nu s-au găsit incidente aprobate pentru aceste criterii.", open: "Deschide fișa", rank: "Relevanță relativă", rankNote: "Ordinea în această căutare, nu o probabilitate.", page: "Pagina", causes: "Cauze înregistrate", actions: "Acțiuni documentate", confirmed: "Cauză rădăcină confirmată", rejected: "Analizată, neconfirmată", uncertain: "Nesigură", planned: "Planificată", inProgress: "În curs", completed: "Finalizată (confirmată)", cancelled: "Anulată", unknown: "Stare necunoscută", plannedDate: "Planificată", actualDate: "Finalizare reală", noCause: "Nu există cauze rădăcină înregistrate.", noAction: "Nu există acțiuni înregistrate.", disclaimer: "Asemănarea nu dovedește o cauză rădăcină comună.", requestError: "Căutarea incidentelor nu a putut fi finalizată." },
};

async function readSearch(response: Response) {
  const result = await response.json() as { ok?: boolean; data?: { results: SearchResult[]; semanticUnavailable: boolean; notice: string | null; disclaimer: string }; message?: string };
  if (!response.ok || !result.ok || !result.data) throw new Error(result.message ?? "Incident search could not be completed.");
  return result.data;
}

function actionStatus(status: string, t: Record<string, string>) {
  if (status === "PLANNED") return t.planned;
  if (status === "IN_PROGRESS") return t.inProgress;
  if (status === "COMPLETED") return t.completed;
  if (status === "CANCELLED") return t.cancelled;
  return t.unknown;
}

export function IncidentKnowledgeSearchPanel({
  storagePlantCode,
  locale,
  onOpenDocument,
}: {
  storagePlantCode: string;
  locale: string;
  onOpenDocument: (plantCode: string, documentId: string) => void;
}) {
  const t = COPY[locale.split("-")[0]] ?? COPY.en;
  const [values, setValues] = useState({ q: "", from: "", to: "", type: "", department: "", equipment: "", causeCategory: "" });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values)) if (value.trim()) params.set(key, value.trim());
      if (!storagePlantCode) throw new Error(t.requestError);
      const data = await readSearch(await fetch(`/api/plants/${encodeURIComponent(storagePlantCode)}/incident-knowledge/search?${params}`, { cache: "no-store" }));
      setResults(data.results);
      setNotice(data.notice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.requestError);
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="incident-knowledge-search-title">
      <div className="mb-3">
        <h2 id="incident-knowledge-search-title" className="font-semibold text-slate-900">{t.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
      </div>
      <form onSubmit={search} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600 md:col-span-2 xl:col-span-4">
          {t.query}
          <input value={values.q} onChange={(event) => setValues((current) => ({ ...current, q: event.target.value }))} className={`${inputClass} mt-1`} maxLength={200} />
        </label>
        {(["from", "to"] as const).map((key) => <label key={key} className="text-xs font-semibold text-slate-600">{t[key]}<input type="date" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className={`${inputClass} mt-1`} /></label>)}
        {(["type", "department", "equipment", "causeCategory"] as const).map((key) => <label key={key} className="text-xs font-semibold text-slate-600">{t[key === "causeCategory" ? "cause" : key]}<input value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className={`${inputClass} mt-1`} /></label>)}
        <div className="flex items-end"><button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? t.searching : t.search}</button></div>
      </form>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p> : null}
      {results.length ? <div className="mt-4 space-y-3">
        <p className="text-xs text-slate-500">{t.disclaimer}</p>
        {results.map((result) => <article key={result.documentId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold text-blue-800">{result.sourceType === "HISTORICAL_PDF" ? result.plantName : `${result.plantName} · ${result.plantCode}`}</p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="font-semibold text-slate-900">{result.incidentCode || result.incidentType || "S-EWO"}{result.incidentType ? ` · ${result.incidentType}` : ""}</h3><p className="mt-1 text-xs text-slate-500">{[result.incidentDate, result.department, result.equipment].filter(Boolean).join(" · ")}</p></div>
            <div className="flex items-center gap-2"><span className="text-xs text-slate-600">{t.rank}: {result.relevance}</span><button type="button" onClick={() => onOpenDocument(result.plantCode, result.documentId)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100">{t.open}</button></div>
          </div>
          {result.summary ? <p className="mt-3 text-sm text-slate-700">{result.summary}</p> : null}
          {result.excerpts.map((excerpt, index) => <blockquote key={index} className="mt-3 rounded-md border-l-2 border-blue-800 bg-white px-3 py-2 text-sm text-slate-700">{excerpt.text}{excerpt.page ? <span className="ml-2 text-xs text-slate-500">({t.page} {excerpt.page})</span> : null}</blockquote>)}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div><h4 className="text-xs font-semibold text-slate-700">{t.causes}</h4>{result.causes.length ? <ul className="mt-1 space-y-1 text-xs text-slate-600">{result.causes.map((cause, index) => <li key={index}><span className="font-semibold">{cause.code} {cause.label || cause.category}</span> — {cause.assessmentStatus === "CONFIRMED" ? t.confirmed : cause.assessmentStatus === "REJECTED" ? t.rejected : t.uncertain}{cause.page ? ` · ${t.page} ${cause.page}` : ""}{cause.description ? <span className="block">{cause.description}</span> : null}</li>)}</ul> : <p className="mt-1 text-xs text-slate-500">{t.noCause}</p>}</div>
            <div><h4 className="text-xs font-semibold text-slate-700">{t.actions}</h4>{result.actions.length ? <ul className="mt-1 space-y-1 text-xs text-slate-600">{result.actions.map((action, index) => <li key={index}>{action.description} — {actionStatus(action.status, t)}{action.plannedDate ? ` · ${t.plannedDate}: ${action.plannedDate}` : ""}{action.actualDate ? ` · ${t.actualDate}: ${action.actualDate}` : ""}{action.page ? ` · ${t.page} ${action.page}` : ""}</li>)}</ul> : <p className="mt-1 text-xs text-slate-500">{t.noAction}</p>}</div>
          </div>
        </article>)}
      </div> : notice || error ? null : null}
      {!busy && !error && results.length === 0 && (Object.values(values).some((value) => value.trim())) ? <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{t.empty}</p> : null}
      {results.length ? <p className="mt-3 text-xs text-slate-500">{t.rankNote}</p> : null}
    </section>
  );
}
