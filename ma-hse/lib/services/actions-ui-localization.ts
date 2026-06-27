import { BASE_ACTIONS_UI, type ActionsUi } from "@/lib/actions-ui";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

type PartialDeep<T> = {
  [Key in keyof T]?: T[Key] extends Record<string, unknown> ? PartialDeep<T[Key]> : T[Key];
};

const PT_ACTIONS_UI: PartialDeep<ActionsUi> = {
  table: {
    local: "Local",
    allLocations: "Todos os locais",
    status: "Estado",
    allStatuses: "Todos os estados",
    owner: "Responsavel",
    allOwners: "Todos os responsaveis",
    dueFrom: "Prazo de",
    dueTo: "Prazo ate",
    dateOrder: "Ordem por data",
    dueDateAscending: "Prazo ascendente",
    dueDateDescending: "Prazo descendente",
    bulkClosureComment: "Comentario de fecho em lote",
    bulkClosurePlaceholder: "O que foi feito para fechar as acoes selecionadas?",
    closureDate: "Data de fecho",
    photosDocuments: "Fotos / documentos",
    closing: "A fechar...",
    closeSelected: "Fechar selecionadas",
    bulkHelp: "Selecione varias acoes na lista e feche-as em conjunto. Os anexos sao opcionais.",
    shownCount: "{count} acao(oes) apresentadas. {openCount} acao(oes) abertas.",
    exportExcel: "Exportar Excel",
    exportPdf: "Exportar PDF",
    exporting: "A exportar...",
    select: "Selecionar",
    action: "Acao",
    source: "Origem",
    priority: "Prioridade",
    due: "Prazo",
    open: "Abrir",
    delete: "Eliminar",
    deleting: "A eliminar...",
    hide: "Ocultar",
    openClose: "Abrir / fechar",
    openOnly: "Abrir",
    linkedRecords: "Registos associados",
    manualOrigin: "Origem manual",
    communication: "Comunicacao",
    sewo: "S-EWO",
    smat: "SMAT",
    evidenceAttached: "Evidencias ja anexadas",
    closeAction: "Fechar acao",
    describeClosure: "Descreva o que foi feito.",
    alreadyClosed: "Esta acao ja esta fechada.",
    noRows: "Nao foram encontradas acoes para os filtros selecionados.",
    selectAtLeastOne: "Selecione pelo menos uma acao.",
    closureCommentMin: "Escreva pelo menos 5 caracteres no comentario de fecho.",
    bulkClosureCommentMin: "Escreva pelo menos 5 caracteres no comentario de fecho em lote.",
    selectClosureDate: "Selecione uma data de fecho.",
    closeFailed: "Falha ao fechar a acao",
    bulkCloseFailed: "Falha ao fechar as acoes selecionadas",
    deleteFailed: "Falha ao eliminar a acao",
    exportFailed: "Falha ao exportar acoes.",
    confirmDelete: "Eliminar esta acao? Esta acao nao pode ser recuperada.",
  },
  detail: {
    title: "Detalhe da Acao",
    main: "Principal",
    lifecycle: "Ciclo de vida",
    fieldTitle: "Titulo",
    fieldStatus: "Estado",
    fieldPriority: "Prioridade",
    fieldCategory: "Categoria",
    fieldSourceType: "Tipo de origem",
    fieldOwner: "Responsavel",
    fieldDueDate: "Prazo",
    fieldCreatedAt: "Criada em",
    fieldUpdatedAt: "Atualizada em",
    fieldClosureDate: "Data de fecho",
    fieldClosedAt: "Fechada em",
    fieldClosedBy: "Fechada por",
    fieldReopenedAt: "Reaberta em",
    fieldReopenedBy: "Reaberta por",
    description: "Action",
    linkedRecordDescription: "Descrição de comunicação",
    linkedRecords: "Registos associados",
    manualOrigin: "Origem manual",
    communication: "Comunicacao",
    sewo: "S-EWO",
    smat: "SMAT",
    coOwners: "Coresponsaveis",
    evidence: "Evidencias",
    comments: "Comentarios",
    closureComment: "Comentario de fecho",
    reopenReason: "Motivo de reabertura",
    backToActions: "Voltar as acoes",
  },
  statusLabels: {
    OPEN: "Aberta",
    ONGOING: "Em curso",
    CLOSED: "Fechada",
  },
  priorityLabels: {
    LOW: "Baixa",
    MEDIUM: "Media",
    HIGH: "Alta",
  },
  categoryLabels: {
    CORRECTIVE: "Corretiva",
    PREVENTIVE: "Preventiva",
    IMPROVEMENT: "Melhoria",
  },
  sourceTypeLabels: {
    MANUAL: "Manual",
    COMMUNICATION: "Comunicacao",
    SEWO: "S-EWO",
    SMAT: "SMAT",
  },
  manualOriginLabels: {
    AUDITS: "Auditorias",
    EXTERNAL_VERIFICATIONS: "Verificacoes Externas",
    OTHER: "Outras",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeWithFallback<T>(fallback: T, selected: unknown): T {
  if (!isRecord(fallback)) {
    return (selected ?? fallback) as T;
  }

  if (!isRecord(selected)) {
    return fallback;
  }

  const result: Record<string, unknown> = { ...fallback };
  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const selectedValue = selected[key];
    result[key] = isRecord(fallbackValue)
      ? mergeWithFallback(fallbackValue, selectedValue)
      : selectedValue ?? fallbackValue;
  }

  return result as T;
}

type PathSegment = string | number;
type StringEntry = { path: PathSegment[]; value: string };

function collectStringEntries(value: unknown, path: PathSegment[] = [], entries: StringEntry[] = []) {
  if (typeof value === "string") {
    entries.push({ path, value });
    return entries;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStringEntries(item, [...path, index], entries));
    return entries;
  }

  if (isRecord(value)) {
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

export async function getLocalizedActionsUi(locale: string): Promise<ActionsUi> {
  if (locale === "pt") {
    return mergeWithFallback(BASE_ACTIONS_UI, PT_ACTIONS_UI);
  }

  if (locale === "en") {
    return BASE_ACTIONS_UI;
  }

  return translateStructured(locale, BASE_ACTIONS_UI) as Promise<ActionsUi>;
}
