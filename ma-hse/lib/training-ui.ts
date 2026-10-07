const en = {
  module: "Training / Competences", training: "Training", competences: "Competences", overview: "Overview",
  add: "+ Add training", date: "Date", topic: "Training topic", type: "Training type", duration: "Duration (HH:MM)",
  trainee: "Trainee", trainers: "Trainers", select: "Select…", manual: "Enter a name manually", selectWorker: "Select a worker",
  workerSearch: "Search worker", addTrainer: "Add trainer", remove: "Remove", save: "Save", cancel: "Cancel", saving: "Saving…",
  allTopics: "All topics", allTypes: "All training types", year: "Year", noRecords: "No training records match these filters.",
  noTopics: "No active training topics. Define the training topics in Admin before adding a record.", admin: "Open Admin",
  catalog: "Training topics", newTopic: "Add topic", edit: "Edit", active: "Active", inactive: "Inactive", status: "Status", actions: "Actions",
  deactivate: "Deactivate", activate: "Activate", catalogHelp: "Topics available in the Training form. Deactivating a topic preserves its history.",
  hours: "Training hours", previous: "Previous year", comparison: "Change vs. previous year", noComparison: "No hours in the previous year",
  perWorker: "Training hours / worker", workers: "active plant workers", share: "% of training records", noData: "No data",
  indicators: "Plant indicators", indicatorHelp: "Annual totals for the plant. Topic and type filters apply to the table only.",
  error: "Unable to save. Check the fields and try again.", duplicate: "A topic with this name already exists.",
  unavailableTopic: "This topic is no longer available. Refresh the page.", unavailableWorker: "A selected worker is no longer active in this plant. Refresh the page.",
  trainerRequired: "Select at least one trainer.", traineeRequired: "Select one worker or enter the trainee's name.",
  durationHint: "Hours and minutes, for example 02:30.", personalRecords: "The table shows your training records.",
};
export type TrainingUi = typeof en;
const pt: TrainingUi = {
  module: "Formação / Competências", training: "Formação", competences: "Competências", overview: "Visão geral",
  add: "+ Adicionar formação", date: "Data", topic: "Tema de Formação", type: "Tipo Formação", duration: "Carga Horária (HH:MM)",
  trainee: "Formando", trainers: "Formadores", select: "Selecionar…", manual: "Escrever nome manualmente", selectWorker: "Selecionar trabalhador",
  workerSearch: "Pesquisar trabalhador", addTrainer: "Adicionar formador", remove: "Remover", save: "Guardar", cancel: "Cancelar", saving: "A guardar…",
  allTopics: "Todos os temas", allTypes: "Todos os tipos de formação", year: "Ano", noRecords: "Sem formações para os filtros selecionados.",
  noTopics: "Sem temas de formação ativos. Defina a lista de temas em Admin antes de adicionar uma formação.", admin: "Abrir Admin",
  catalog: "Temas de Formação", newTopic: "Adicionar tema", edit: "Editar", active: "Ativo", inactive: "Inativo", status: "Estado", actions: "Ações",
  deactivate: "Desativar", activate: "Ativar", catalogHelp: "Temas disponíveis no formulário de Formação. A desativação de um tema preserva o histórico.",
  hours: "Total de horas de formação", previous: "Ano anterior", comparison: "Variação face ao ano anterior", noComparison: "Sem horas no ano anterior",
  perWorker: "Horas de formação / trabalhador", workers: "trabalhadores ativos da planta", share: "% dos registos de formação", noData: "Sem dados",
  indicators: "Indicadores da planta", indicatorHelp: "Totais anuais da planta. Os filtros de tema e tipo aplicam-se apenas à tabela.",
  error: "Não foi possível guardar. Verifique os campos e tente novamente.", duplicate: "Já existe um tema com este nome.",
  unavailableTopic: "Este tema já não está disponível. Atualize a página.", unavailableWorker: "Um trabalhador selecionado já não está ativo nesta planta. Atualize a página.",
  trainerRequired: "Selecione pelo menos um formador.", traineeRequired: "Selecione um trabalhador ou escreva o nome do formando.",
  durationHint: "Horas e minutos, por exemplo 02:30.", personalRecords: "A tabela apresenta as suas formações.",
};

export const TRAINING_MODULE_NAMES: Record<string, string> = {
  pt: pt.module, en: en.module, it: "Formazione / Competenze", pl: "Szkolenia / Kompetencje",
  de: "Schulung / Kompetenzen", ro: "Formare / Competențe", fr: "Formation / Compétences",
};

export function getTrainingUi(locale: string): TrainingUi {
  const areaNames: Record<string, [string, string]> = {
    it: ["Formazione", "Competenze"], pl: ["Szkolenia", "Kompetencje"], de: ["Schulung", "Kompetenzen"],
    ro: ["Formare", "Competențe"], fr: ["Formation", "Compétences"],
  };
  return locale === "pt" ? pt : { ...en, module: TRAINING_MODULE_NAMES[locale] ?? en.module, training: areaNames[locale]?.[0] ?? en.training, competences: areaNames[locale]?.[1] ?? en.competences };
}

export function trainingErrorMessage(code: string | undefined, ui: TrainingUi) {
  if (code === "TRAINING_TOPIC_DUPLICATE") return ui.duplicate;
  if (code === "TRAINING_TOPIC_UNAVAILABLE") return ui.unavailableTopic;
  if (code === "TRAINING_WORKER_UNAVAILABLE") return ui.unavailableWorker;
  return ui.error;
}
