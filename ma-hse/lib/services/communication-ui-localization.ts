import { BASE_COMMUNICATION_UI, type CommunicationUi } from "@/lib/communication-ui";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

type PartialDeep<T> = {
  [Key in keyof T]?: T[Key] extends Record<string, unknown> ? PartialDeep<T[Key]> : T[Key];
};

const PT_COMMUNICATION_UI: PartialDeep<CommunicationUi> = {
  createCommunicationQuick: {
    title: "Comunicacao rapida",
    expandSection: "Mostrar",
    collapseSection: "Ocultar",
    eventDatetime: "Data e hora",
    reporterFromPlantWorkers: "Comunicante dos trabalhadores da planta",
    reporterNumber: "Numero do comunicante",
    involvedWorkerFromPlantWorkers: "Trabalhador envolvido dos trabalhadores da planta",
    clinicalDetails: "Detalhes clinicos",
    department: "Departamento",
    location: "Local",
    professionalRisk: "Risco profissional",
    unsafeActType: "Tipo de ato inseguro",
    unsafeConditionType: "Tipo de condicao perigosa",
    nearMissType: "Tipo de near miss",
    improvementSubtype: "Subtipo",
    involvedWorker: "Trabalhador envolvido",
    injuryType: "Tipo de lesao",
    lostDays: "Dias perdidos",
    fatalInjury: "Lesao fatal",
    description: "Descricao",
    suggestedAction: "Acao sugerida",
    linkedAction: "Acao associada",
    actionTitle: "Titulo da acao",
    actionDescription: "Descricao da acao",
    actionOwner: "Responsavel pela acao",
    create: "Criar",
    saving: "A guardar...",
    created: "Comunicacao criada",
    createFailed: "Erro ao criar comunicacao",
    priorityLabels: {
      LOW: "Baixa",
      MEDIUM: "Media",
      HIGH: "Alta",
    },
  },
  communicationsTable: {
    type: "Tipo",
    allTypes: "Todos os tipos",
    status: "Estado",
    allStatuses: "Todos os estados",
    reporter: "Comunicante",
    dateFrom: "Data de",
    dateTo: "Data ate",
    department: "Departamento",
    allDepartments: "Todos os departamentos",
    location: "Local",
    allLocations: "Todos os locais",
    involvedWorker: "Trabalhador envolvido",
    unsafeActType: "Tipo de ato inseguro",
    allUnsafeActTypes: "Todos os tipos de ato inseguro",
    unsafeConditionType: "Tipo de condicao perigosa",
    allUnsafeConditionTypes: "Todos os tipos de condicao perigosa",
    nearMissType: "Tipo de near miss",
    allNearMissTypes: "Todos os tipos de near miss",
    shownCount: "{count} comunicacao(oes) apresentadas.",
    exportExcel: "Exportar Excel",
    exportPdf: "Exportar PDF",
    exporting: "A exportar...",
    exportFailed: "Falha ao exportar comunicacoes.",
    event: "Evento",
    detail: "Detalhe",
    openEdit: "Abrir / editar",
    delete: "Eliminar",
    deleting: "A eliminar...",
    confirmDelete: "Eliminar a comunicacao de {event}? Esta acao nao pode ser recuperada.",
    deleted: "Comunicacao eliminada.",
    deleteFailed: "Falha ao eliminar comunicacao",
    noRows: "Nao foram encontradas comunicacoes para os filtros selecionados.",
    toDo: "Por tratar",
    onGoing: "Em curso",
    closed: "Fechada",
  },
  validationQueue: {
    allTypes: "Todos os tipos",
    reporter: "Comunicante",
    department: "Departamento",
    location: "Local",
    date: "Data",
    openEdit: "Abrir / editar",
  },
  validationActions: {
    title: "Validacao",
    defaultNotes: "Revisto pela seguranca",
    validate: "Validar",
    validateCommunication: "Validar comunicacao",
    reject: "Rejeitar",
    rejectCommunication: "Rejeitar comunicacao",
    confirmReject: "Rejeitar e eliminar esta comunicacao? Esta acao nao pode ser recuperada.",
    saved: "Validacao guardada",
    rejectedDeleted: "Comunicacao rejeitada e eliminada",
    failed: "Falha na validacao",
    reporterReviewRequired: "Abra a comunicacao e selecione um comunicante valido antes de validar.",
    classificationRequired: "Abra a comunicacao e preencha os campos de classificacao obrigatorios antes de validar.",
  },
  detailPage: {
    attachments: "Anexos",
    noAttachments: "Sem anexos.",
    linkedRecords: "Registos associados",
    actions: "Acoes",
    sewoRecords: "Registos S-EWO",
    backToCommunications: "Voltar as comunicacoes",
    backToValidation: "Voltar a validacao",
  },
  detailEditor: {
    communicationRecord: "Registo da comunicacao",
    statusManagement: "Gestao de estado",
    statusChangeReason: "Motivo da alteracao de estado",
    closeCommunication: "Definir estado como Fechada",
    reopenCommunication: "Reabrir comunicacao",
    statusChangeSaved: "Estado da comunicacao atualizado com sucesso.",
    statusChangeFailed: "Falha ao atualizar o estado da comunicacao.",
    statusReasonRequired: "Escreva pelo menos 5 caracteres para justificar a alteracao de estado.",
    cannotCloseWithOpenActions: "Nao e possivel fechar esta comunicacao porque existem acoes associadas ainda em aberto.",
    linkedActions: "Acoes associadas",
    reporterFromPlantWorkers: "Comunicante dos trabalhadores da planta",
    department: "Departamento",
    location: "Local",
    equipment: "Equipamento",
    professionalRisk: "Risco profissional",
    severityPotential: "Gravidade potencial",
    unsafeActType: "Tipo de ato inseguro",
    unsafeConditionType: "Tipo de condicao perigosa",
    nearMissType: "Tipo de near miss",
    improvementSubtype: "Subtipo",
    involvedWorker: "Trabalhador envolvido",
    injuryType: "Tipo de lesao",
    contractorInvolved: "Contratado envolvido",
    lostDays: "Dias perdidos",
    fatalInjury: "Lesao fatal",
    suggestedAction: "Acao sugerida",
    low: "Baixa",
    medium: "Media",
    high: "Alta",
    exportPdf: "Exportar PDF",
    generatingPdf: "A gerar...",
    exportPdfFailed: "Falha ao exportar PDF.",
    saving: "A guardar...",
    applyingStatus: "A aplicar...",
    saveCommunication: "Guardar comunicacao",
    updatedSuccessfully: "Comunicacao atualizada com sucesso.",
    updateFailed: "Falha ao atualizar comunicacao",
    editingRestricted: "A edicao esta disponivel apenas quando o utilizador tem as permissoes N1, N2 ou N3 exigidas para o estado atual do fluxo.",
  },
  createActionQuick: {
    newLinkedAction: "Nova acao associada",
    newAction: "Nova acao",
    manualAction: "Acao manual",
    linkedToCommunication: "Associada a comunicacao",
    linkedToSewo: "Associada a S-EWO",
    linkedToSmat: "Associada a SMAT",
    manualOrigin: "Origem da acao",
    selectManualOrigin: "Selecionar origem da acao",
    manualOriginLabels: {
      AUDITS: "Auditorias",
      EXTERNAL_VERIFICATIONS: "Verificacoes Externas",
      OTHER: "Outras",
    },
    linkedCommunication: "Comunicacao associada",
    selectCommunication: "Selecionar comunicacao",
    selectSewo: "Selecionar S-EWO",
    selectSmat: "Selecionar SMAT",
    noLinkMessage: "Esta acao sera criada sem ligacoes a comunicacao, S-EWO ou SMAT.",
    title: "Titulo",
    description: "Descricao",
    owner: "Responsavel",
    createAction: "Criar acao",
    creatingAction: "A criar acao...",
    actionCreated: "Acao criada com sucesso.",
    existingActionReused: "Ja existe uma acao aberta para esta comunicacao.",
    failedCreatingAction: "Falha ao criar acao.",
    createActionStateUnknown: "Nao foi possivel confirmar o pedido. A comunicacao sera atualizada para recuperar o estado da acao.",
    categoryLabels: {
      CORRECTIVE: "Corretiva",
      PREVENTIVE: "Preventiva",
      IMPROVEMENT: "Melhoria",
    },
    priorityLabels: {
      LOW: "Baixa",
      MEDIUM: "Media",
      HIGH: "Alta",
    },
  },
  communicationTypeLabels: {
    UNSAFE_ACT: "Ato inseguro",
    UNSAFE_CONDITION: "Condicao perigosa",
    NEAR_MISS: "Near miss",
    FIRST_AID: "Primeiros socorros",
    ACCIDENT: "Acidente",
    FIVE_S_IMPROVEMENT: "Melhoria 5S's",
    IMPROVEMENT_SUGGESTION: "Sugestão de melhoria",
  },
  communicationImprovementSubtypeLabels: {
    FIVE_S_AREA_IMPROVEMENT: "Melhoria de área",
    FIVE_S_DISORGANIZATION: "Desorganização",
    IMPROVEMENT_SAFETY: "Segurança",
    IMPROVEMENT_HEALTH: "Saúde",
    IMPROVEMENT_ENVIRONMENT: "Ambiente",
  },
  communicationStatusLabels: {
    SUBMITTED: "Por tratar",
    PENDING_VALIDATION: "Pendente de validacao",
    VALID_OPEN: "Por tratar",
    ONGOING: "Em curso",
    CLOSED: "Fechada",
    REJECTED: "Rejeitada",
    INVALID: "Rejeitada",
  },
  actionStatusLabels: {
    OPEN: "Aberta",
    ONGOING: "Em curso",
    CLOSED: "Fechada",
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

export async function getLocalizedCommunicationUi(locale: string): Promise<CommunicationUi> {
  if (locale === "pt") {
    return mergeWithFallback(BASE_COMMUNICATION_UI, PT_COMMUNICATION_UI);
  }

  if (locale === "en") {
    return BASE_COMMUNICATION_UI;
  }

  return translateStructured(locale, BASE_COMMUNICATION_UI) as Promise<CommunicationUi>;
}
