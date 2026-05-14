type SupportedReportLocale = "pt" | "it" | "en" | "pl" | "de" | "ro" | "fr";

type ReportText = {
  title: string;
  intro: string;
  type: string;
  typeUnsafeAct: string;
  typeUnsafeCondition: string;
  typeNearMiss: string;
  typeFirstAid: string;
  dateTime: string;
  reporterName: string;
  reporterNumber: string;
  department: string;
  selectDepartment: string;
  location: string;
  selectLocation: string;
  shift: string;
  selectShift: string;
  involvedWorker: string;
  selectInvolvedWorker: string;
  natureOfInjury: string;
  selectNature: string;
  bodyPartAffected: string;
  selectBodyPart: string;
  description: string;
  suggestedAction: string;
  submit: string;
  submitSuccess: string;
  submitFailed: string;
};

const REPORT_TEXTS: Record<SupportedReportLocale, ReportText> = {
  en: {
    title: "Plant Safety Report",
    intro: "Unsafe Act, Unsafe Condition, Near Miss and First Aid follow the same mandatory logic as the software communication flow.",
    type: "Type",
    typeUnsafeAct: "Unsafe Act",
    typeUnsafeCondition: "Unsafe Condition",
    typeNearMiss: "Near Miss",
    typeFirstAid: "First Aid",
    dateTime: "Date and time",
    reporterName: "Reporter name",
    reporterNumber: "Reporter number",
    department: "Department",
    selectDepartment: "Select department",
    location: "Location",
    selectLocation: "Select location",
    shift: "Shift",
    selectShift: "Select shift",
    involvedWorker: "Involved worker",
    selectInvolvedWorker: "Select involved worker",
    natureOfInjury: "Nature of injury",
    selectNature: "Select nature of injury",
    bodyPartAffected: "Body part affected",
    selectBodyPart: "Select body part",
    description: "Description",
    suggestedAction: "Suggested action",
    submit: "Submit communication",
    submitSuccess: "Communication submitted successfully.",
    submitFailed: "Submission failed",
  },
  pt: {
    title: "Relatorio de Seguranca da Fabrica",
    intro: "Ato inseguro, condicao insegura, quase acidente e primeiros socorros seguem a mesma logica obrigatoria do fluxo de comunicacao do software.",
    type: "Tipo",
    typeUnsafeAct: "Ato inseguro",
    typeUnsafeCondition: "Condicao insegura",
    typeNearMiss: "Quase acidente",
    typeFirstAid: "Primeiros socorros",
    dateTime: "Data e hora",
    reporterName: "Nome do comunicante",
    reporterNumber: "Numero do comunicante",
    department: "Departamento",
    selectDepartment: "Selecionar departamento",
    location: "Local",
    selectLocation: "Selecionar local",
    shift: "Turno",
    selectShift: "Selecionar turno",
    involvedWorker: "Trabalhador envolvido",
    selectInvolvedWorker: "Selecionar trabalhador envolvido",
    natureOfInjury: "Natureza da lesao",
    selectNature: "Selecionar natureza da lesao",
    bodyPartAffected: "Parte do corpo afetada",
    selectBodyPart: "Selecionar parte do corpo",
    description: "Descricao",
    suggestedAction: "Acao sugerida",
    submit: "Submeter comunicacao",
    submitSuccess: "Comunicacao submetida com sucesso.",
    submitFailed: "Falha no envio",
  },
  it: {
    title: "Segnalazione di Sicurezza dello Stabilimento",
    intro: "Atto insicuro, condizione insicura, near miss e primo soccorso seguono la stessa logica obbligatoria del flusso comunicazioni del software.",
    type: "Tipo",
    typeUnsafeAct: "Atto insicuro",
    typeUnsafeCondition: "Condizione insicura",
    typeNearMiss: "Near miss",
    typeFirstAid: "Primo soccorso",
    dateTime: "Data e ora",
    reporterName: "Nome del segnalatore",
    reporterNumber: "Numero del segnalatore",
    department: "Reparto",
    selectDepartment: "Seleziona reparto",
    location: "Luogo",
    selectLocation: "Seleziona luogo",
    shift: "Turno",
    selectShift: "Seleziona turno",
    involvedWorker: "Lavoratore coinvolto",
    selectInvolvedWorker: "Seleziona lavoratore coinvolto",
    natureOfInjury: "Natura della lesione",
    selectNature: "Seleziona natura della lesione",
    bodyPartAffected: "Parte del corpo interessata",
    selectBodyPart: "Seleziona parte del corpo",
    description: "Descrizione",
    suggestedAction: "Azione suggerita",
    submit: "Invia comunicazione",
    submitSuccess: "Comunicazione inviata con successo.",
    submitFailed: "Invio non riuscito",
  },
  pl: {
    title: "Raport Bezpieczenstwa Zakladu",
    intro: "Niebezpieczne zachowanie, niebezpieczny stan, near miss i pierwsza pomoc korzystaja z tej samej obowiazkowej logiki przeplywu zgloszen w systemie.",
    type: "Typ",
    typeUnsafeAct: "Niebezpieczne zachowanie",
    typeUnsafeCondition: "Niebezpieczny stan",
    typeNearMiss: "Near miss",
    typeFirstAid: "Pierwsza pomoc",
    dateTime: "Data i godzina",
    reporterName: "Imie i nazwisko zglaszajacego",
    reporterNumber: "Numer zglaszajacego",
    department: "Dzial",
    selectDepartment: "Wybierz dzial",
    location: "Lokalizacja",
    selectLocation: "Wybierz lokalizacje",
    shift: "Zmiana",
    selectShift: "Wybierz zmiane",
    involvedWorker: "Zaangazowany pracownik",
    selectInvolvedWorker: "Wybierz pracownika",
    natureOfInjury: "Rodzaj urazu",
    selectNature: "Wybierz rodzaj urazu",
    bodyPartAffected: "Dotknieta czesc ciala",
    selectBodyPart: "Wybierz czesc ciala",
    description: "Opis",
    suggestedAction: "Sugerowane dzialanie",
    submit: "Wyslij zgloszenie",
    submitSuccess: "Zgloszenie zostalo wyslane pomyslnie.",
    submitFailed: "Nie udalo sie wyslac",
  },
  de: {
    title: "Sicherheitsmeldung des Werks",
    intro: "Unsichere Handlung, unsicherer Zustand, Beinaheunfall und Erste Hilfe folgen derselben verpflichtenden Logik wie der Kommunikationsfluss der Software.",
    type: "Typ",
    typeUnsafeAct: "Unsichere Handlung",
    typeUnsafeCondition: "Unsicherer Zustand",
    typeNearMiss: "Beinaheunfall",
    typeFirstAid: "Erste Hilfe",
    dateTime: "Datum und Uhrzeit",
    reporterName: "Name des Meldenden",
    reporterNumber: "Nummer des Meldenden",
    department: "Abteilung",
    selectDepartment: "Abteilung auswahlen",
    location: "Ort",
    selectLocation: "Ort auswahlen",
    shift: "Schicht",
    selectShift: "Schicht auswahlen",
    involvedWorker: "Beteiligter Mitarbeiter",
    selectInvolvedWorker: "Mitarbeiter auswahlen",
    natureOfInjury: "Art der Verletzung",
    selectNature: "Verletzungsart auswahlen",
    bodyPartAffected: "Betroffener Korperteil",
    selectBodyPart: "Korperteil auswahlen",
    description: "Beschreibung",
    suggestedAction: "Vorgeschlagene Massnahme",
    submit: "Meldung senden",
    submitSuccess: "Meldung erfolgreich gesendet.",
    submitFailed: "Senden fehlgeschlagen",
  },
  ro: {
    title: "Raport de Siguranta al Fabricii",
    intro: "Actul nesigur, conditia nesigura, near miss si primul ajutor urmeaza aceeasi logica obligatorie ca fluxul de comunicare din software.",
    type: "Tip",
    typeUnsafeAct: "Act nesigur",
    typeUnsafeCondition: "Conditie nesigura",
    typeNearMiss: "Near miss",
    typeFirstAid: "Prim ajutor",
    dateTime: "Data si ora",
    reporterName: "Numele raportorului",
    reporterNumber: "Numarul raportorului",
    department: "Departament",
    selectDepartment: "Selectati departamentul",
    location: "Locatie",
    selectLocation: "Selectati locatia",
    shift: "Schimb",
    selectShift: "Selectati schimbul",
    involvedWorker: "Lucrator implicat",
    selectInvolvedWorker: "Selectati lucratorul implicat",
    natureOfInjury: "Natura leziunii",
    selectNature: "Selectati natura leziunii",
    bodyPartAffected: "Partea corpului afectata",
    selectBodyPart: "Selectati partea corpului",
    description: "Descriere",
    suggestedAction: "Actiune sugerata",
    submit: "Trimite comunicarea",
    submitSuccess: "Comunicarea a fost trimisa cu succes.",
    submitFailed: "Trimiterea a esuat",
  },
  fr: {
    title: "Rapport de Securite de l'Usine",
    intro: "Acte dangereux, condition dangereuse, presque accident et premiers secours suivent la meme logique obligatoire que le flux de communication du logiciel.",
    type: "Type",
    typeUnsafeAct: "Acte dangereux",
    typeUnsafeCondition: "Condition dangereuse",
    typeNearMiss: "Presque accident",
    typeFirstAid: "Premiers secours",
    dateTime: "Date et heure",
    reporterName: "Nom du declarant",
    reporterNumber: "Numero du declarant",
    department: "Departement",
    selectDepartment: "Selectionner le departement",
    location: "Lieu",
    selectLocation: "Selectionner le lieu",
    shift: "Equipe",
    selectShift: "Selectionner l'equipe",
    involvedWorker: "Travailleur implique",
    selectInvolvedWorker: "Selectionner le travailleur implique",
    natureOfInjury: "Nature de la blessure",
    selectNature: "Selectionner la nature de la blessure",
    bodyPartAffected: "Partie du corps affectee",
    selectBodyPart: "Selectionner la partie du corps",
    description: "Description",
    suggestedAction: "Action suggeree",
    submit: "Envoyer la communication",
    submitSuccess: "Communication envoyee avec succes.",
    submitFailed: "Echec de l'envoi",
  },
};

const PT_BODY_PARTS: Record<string, string> = {
  BP01: "Cabeca",
  BP02: "Olho esquerdo",
  BP03: "Olho direito",
  BP04: "Ombro esquerdo",
  BP05: "Ombro direito",
  BP06: "Braco esquerdo",
  BP07: "Braco direito",
  BP08: "Mao esquerda",
  BP09: "Mao direita",
  BP10: "Torax",
  BP11: "Costas superiores",
  BP12: "Costas inferiores",
  BP13: "Abdomen",
  BP14: "Anca esquerda",
  BP15: "Anca direita",
  BP16: "Perna esquerda",
  BP17: "Perna direita",
  BP18: "Joelho esquerdo",
  BP19: "Joelho direito",
  BP20: "Pe esquerdo",
  BP21: "Pe direito",
};

const PT_INJURY_TYPES = [
  "Contusao (pisadura)",
  "Corte / laceracao",
  "Perfuracao",
  "Amputacao (total ou parcial)",
  "Esmagamento",
  "Hematoma",
  "Abrasao / escoriacao",
  "Fratura simples",
  "Fratura exposta",
  "Fratura multipla",
  "Fissura ossea",
  "Luxacao",
  "Subluxacao",
  "Distensao muscular",
  "Rotura muscular",
  "Entorse",
  "Rotura de ligamentos",
  "Tendinite",
  "Tenossinovite",
  "Mialgia (dor muscular)",
  "Entorse articular",
  "Inflamacao articular",
  "Limitacao de movimentos",
  "Derrame articular",
  "Concussao cerebral",
  "Traumatismo cranioencefalico (TCE)",
  "Lesao nervosa periferica",
  "Dormencia / parestesia",
  "Perda de consciencia",
  "Vertigens pos-trauma",
  "Queimadura termica",
  "Queimadura quimica",
  "Queimadura eletrica",
  "Dermatite de contacto",
  "Irritacao cutanea",
  "Bolhas",
  "Corpo estranho no olho",
  "Irritacao ocular",
  "Queimadura ocular",
  "Perda parcial ou total da visao",
  "Trauma acustico",
  "Perda auditiva temporaria",
  "Perda auditiva permanente",
  "Dor no ouvido",
  "Lesao por esforcos repetitivos (LER)",
  "Disturbios musculo-esqueleticos relacionados com o trabalho (DORT)",
  "Sindrome do tunel carpico",
  "Lombalgia",
  "Cervicalgia",
  "Hemorragia interna",
  "Lesao em orgaos internos",
  "Contusao toracica",
  "Traumatismo abdominal",
  "Intoxicacao",
  "Asfixia",
  "Choque eletrico",
  "Golpe de calor",
  "Hipotermia",
  "Reacao alergica",
] as const;

type CatalogRow = {
  code?: string | null;
  name: string;
};

function normalizeLocale(language: string | null | undefined): SupportedReportLocale {
  if (language && language in REPORT_TEXTS) {
    return language as SupportedReportLocale;
  }
  return "en";
}

function normalizeCatalogText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function injuryTypeIndexFromCode(code?: string | null) {
  if (!code) return null;
  const standardMatch = code.match(/^IT(\d{2})$/i);
  if (standardMatch) return Number(standardMatch[1]) - 1;

  const plantMatch = code.match(/-IT-(\d{3})$/i);
  if (plantMatch) return Number(plantMatch[1]) - 1;

  return null;
}

export function getPublicReportText(language: string | null | undefined) {
  const locale = normalizeLocale(language);
  return {
    locale,
    text: REPORT_TEXTS[locale],
  };
}

export function getLocalizedShiftName(row: CatalogRow, language: string | null | undefined) {
  const locale = normalizeLocale(language);
  if (locale !== "pt") return row.name;

  const codeMatch = row.code?.match(/^S(\d+)$/i);
  if (codeMatch) {
    return `Turno ${codeMatch[1]}`;
  }

  const nameMatch = row.name.match(/^Shift\s+(.+)$/i);
  if (nameMatch) {
    return `Turno ${nameMatch[1]}`;
  }

  return row.name;
}

export function getLocalizedBodyPartName(row: CatalogRow, language: string | null | undefined) {
  const locale = normalizeLocale(language);
  if (locale === "pt" && row.code && PT_BODY_PARTS[row.code]) {
    return PT_BODY_PARTS[row.code];
  }
  return row.name;
}

export function getLocalizedInjuryTypeName(row: CatalogRow, language: string | null | undefined) {
  const locale = normalizeLocale(language);
  if (locale === "pt") {
    const index = injuryTypeIndexFromCode(row.code);
    if (index !== null && PT_INJURY_TYPES[index]) {
      return PT_INJURY_TYPES[index];
    }
  }
  return row.name;
}

export function dedupeCatalogRows<T extends CatalogRow>(rows: T[], getLabel: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeCatalogText(getLabel(row));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
