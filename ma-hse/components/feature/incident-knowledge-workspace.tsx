"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IncidentKnowledgeSearchPanel } from "@/components/feature/incident-knowledge-search-panel";

type Locale = "en" | "pt" | "es" | "fr" | "it" | "de" | "ro" | "pl";
type CauseStatus = "CONFIRMED" | "REJECTED" | "UNCERTAIN";
type ActionStatus = "UNKNOWN" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type RecordDraft = {
  incidentCode: string;
  incidentDate: string;
  department: string;
  workstation: string;
  equipment: string;
  shift: string;
  operationType: string;
  occurrenceDescription: string;
  occurrenceMechanism: string;
  injuryType: string;
  bodyPart: string;
  consequence: string;
  immediateCorrectiveAction: string;
  lessonsLearned: string;
  previousRelatedOccurrences: string;
  sifPsifClassification: string;
};
type CauseDraft = {
  originalCauseCode: string;
  originalCauseLabel: string;
  originalTaxonomyVersion: string;
  normalizedCauseCode: string;
  normalizedCategory: string;
  description: string;
  assessmentStatus: CauseStatus;
  sourcePage: string;
  sourceSection: string;
};
type ActionDraft = {
  description: string;
  actionType: string;
  responsible: string;
  plannedClosureDate: string;
  actualClosureDate: string;
  status: ActionStatus;
  sourcePage: string;
  sourceSection: string;
};
type Evidence = {
  id: string;
  fieldName: string;
  extractedValue: string | null;
  supportingExcerpt: string | null;
  sourcePage: number | null;
  sourceSection: string | null;
  confidence: number | null;
  validationStatus: string;
};
type CauseResponse = Omit<CauseDraft, "sourcePage"> & { id: string; sourcePage: number | null };
type ActionResponse = Omit<ActionDraft, "sourcePage" | "plannedClosureDate" | "actualClosureDate"> & {
  id: string; sourcePage: number | null; plannedClosureDate: string | null; actualClosureDate: string | null;
};
type Detail = {
  id: string;
  sourceType: string;
  sourceReference: string | null;
  originalFilename: string | null;
  incidentDate: string | null;
  incidentType: string | null;
  extractionStatus: string;
  reviewStatus: string;
  documentVersion: number;
  lastError: string | null;
  reviewComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  record: (Omit<RecordDraft, "incidentDate"> & { incidentDate: string | null } & {
    extractionConfidence: number | null;
    causes: CauseResponse[];
    actions: ActionResponse[];
    evidences: Evidence[];
  }) | null;
};
type ListDocument = {
  id: string;
  sourceType: string;
  sourceReference: string | null;
  originalFilename: string | null;
  incidentDate: string | null;
  incidentType: string | null;
  extractionStatus: string;
  reviewStatus: string;
  lastError: string | null;
  reviewComment: string | null;
  createdAt: string;
  plantCode: string;
  plantName: string;
  record: { incidentCode: string | null; department: string | null; occurrenceDescription: string | null } | null;
};
type WorkspacePlant = { code: string; name: string };
type Copy = {
  title: string; subtitle: string; upload: string; uploading: string; chooseFiles: string;
  uploadHint: string; search: string; loading: string; empty: string; files: string;
  document: string; status: string; review: string; pdf: string; noPdf: string;
  source: string; extracted: string; incidentType: string; incidentCode: string; incidentDate: string;
  department: string; workstation: string; equipment: string; shift: string; operationType: string;
  description: string; mechanism: string; injuryType: string; bodyPart: string; consequence: string;
  immediateAction: string; lessons: string; previous: string; sifPsif: string; causes: string;
  addCause: string; causeCode: string; causeLabel: string; taxonomy: string; normalizedCode: string;
  category: string; causeDescription: string; assessment: string; confirmed: string; rejected: string;
  uncertain: string; sourcePage: string; sourceSection: string; actions: string; addAction: string;
  actionDescription: string; actionType: string; responsible: string; plannedDate: string; actualDate: string;
  actionStatus: string; unknown: string; planned: string; inProgress: string; completed: string;
  cancelled: string; evidence: string; confidence: string; save: string; saving: string;
  approve: string; reject: string; decisionComment: string; rejectReason: string; readOnly: string;
  retry: string; retrying: string; retryOcr: string; saveFirst: string; approveConfirm: string;
  rejectConfirm: string; statusLabels: Record<string, string>; emptyValue: string; remove: string;
};

const COPY: Record<Locale, Copy> = {
  en: {
    title: "Incident Knowledge Base", subtitle: "Import historical S-EWO PDFs and review every extracted fact before approval.", upload: "Upload PDFs", uploading: "Uploading…", chooseFiles: "Choose PDF files", uploadHint: "Up to 5 PDFs per batch, 15 MiB per file, 50 MiB total.", search: "Search code or filename", loading: "Loading…", empty: "No documents in this plant yet.", files: "Documents", document: "Document", status: "Status", review: "HSE review", pdf: "Original PDF", noPdf: "Original PDF not available.", source: "Source reference", extracted: "Extracted fields", incidentType: "Incident type", incidentCode: "S-EWO code", incidentDate: "Incident date", department: "Department", workstation: "Workstation / area", equipment: "Equipment", shift: "Shift", operationType: "Operation", description: "Occurrence description", mechanism: "Occurrence mechanism", injuryType: "Injury type", bodyPart: "Body part", consequence: "Consequence", immediateAction: "Immediate corrective action", lessons: "Lessons learned", previous: "Related occurrences", sifPsif: "SIF / PSIF classification", causes: "Causes", addCause: "Add cause", causeCode: "Original code", causeLabel: "Original label", taxonomy: "Original taxonomy version", normalizedCode: "Normalized code (optional)", category: "Normalized category (optional)", causeDescription: "Description", assessment: "Assessment", confirmed: "Confirmed root cause", rejected: "Analyzed, not confirmed", uncertain: "Uncertain", sourcePage: "Source page", sourceSection: "Source section", actions: "Corrective and preventive actions", addAction: "Add action", actionDescription: "Action", actionType: "Action type", responsible: "Responsible", plannedDate: "Planned closure date", actualDate: "Actual closure date", actionStatus: "Action status", unknown: "Unknown", planned: "Planned", inProgress: "In progress", completed: "Completed", cancelled: "Cancelled", evidence: "Extraction evidence", confidence: "Confidence", save: "Save review", saving: "Saving…", approve: "Approve", reject: "Reject", decisionComment: "Review comment / rejection reason", rejectReason: "A reason is required to reject.", readOnly: "Read-only: only approved, privacy-filtered information is available to this profile.", retry: "Retry extraction", retrying: "Retrying…", retryOcr: "No selectable text was found. Review the original PDF manually; automatic OCR is not configured.", saveFirst: "Save the corrected fields before deciding.", approveConfirm: "Approve this reviewed incident?", rejectConfirm: "Reject this document?", statusLabels: { UPLOADED: "Uploaded", EXTRACTING: "Extracting", PENDING_REVIEW: "Pending HSE review", APPROVED: "Approved", INDEXING: "Indexing", INDEXED: "Indexed", FAILED: "Extraction failed", REJECTED: "Rejected", PENDING: "Pending review" }, emptyValue: "Not identified", remove: "Remove",
  },
  pt: {
    title: "Base de Conhecimento de Incidentes", subtitle: "Importe PDFs S-EWO históricos e reveja os dados extraídos antes de aprovar.", upload: "Importar PDFs", uploading: "A importar…", chooseFiles: "Escolher PDFs", uploadHint: "Até 5 PDFs por lote, 15 MiB por ficheiro e 50 MiB no total.", search: "Pesquisar código ou nome do ficheiro", loading: "A carregar…", empty: "Ainda não existem documentos nesta planta.", files: "Documentos", document: "Documento", status: "Estado", review: "Revisão HSE", pdf: "PDF original", noPdf: "PDF original indisponível.", source: "Referência de origem", extracted: "Campos extraídos", incidentType: "Tipo de ocorrência", incidentCode: "Código S-EWO", incidentDate: "Data da ocorrência", department: "Departamento", workstation: "Posto / área", equipment: "Equipamento", shift: "Turno", operationType: "Operação", description: "Descrição da ocorrência", mechanism: "Mecanismo da ocorrência", injuryType: "Tipo de lesão", bodyPart: "Parte do corpo", consequence: "Consequência", immediateAction: "Ação corretiva imediata", lessons: "Lições aprendidas", previous: "Ocorrências relacionadas", sifPsif: "Classificação SIF / PSIF", causes: "Causas", addCause: "Adicionar causa", causeCode: "Código original", causeLabel: "Designação original", taxonomy: "Versão original da taxonomia", normalizedCode: "Código normalizado (opcional)", category: "Categoria normalizada (opcional)", causeDescription: "Descrição", assessment: "Avaliação", confirmed: "Causa raiz confirmada", rejected: "Analisada, não confirmada", uncertain: "Incerta", sourcePage: "Página de origem", sourceSection: "Secção de origem", actions: "Ações corretivas e preventivas", addAction: "Adicionar ação", actionDescription: "Ação", actionType: "Tipo de ação", responsible: "Responsável", plannedDate: "Data planeada", actualDate: "Data real de conclusão", actionStatus: "Estado da ação", unknown: "Desconhecido", planned: "Planeada", inProgress: "Em curso", completed: "Concluída (confirmada)", cancelled: "Cancelada", evidence: "Evidências da extração", confidence: "Confiança", save: "Guardar revisão", saving: "A guardar…", approve: "Aprovar", reject: "Rejeitar", decisionComment: "Comentário / motivo de rejeição", rejectReason: "Indique o motivo antes de rejeitar.", readOnly: "Só de consulta: este perfil vê documentos aprovados com informação filtrada por privacidade.", retry: "Repetir extração", retrying: "A repetir…", retryOcr: "Não foi encontrado texto selecionável. Pode rever manualmente o PDF original; o OCR automático não está configurado.", saveFirst: "Guarde as correções antes de tomar uma decisão.", approveConfirm: "Aprovar esta ocorrência revista?", rejectConfirm: "Rejeitar este documento?", statusLabels: { UPLOADED: "Carregado", EXTRACTING: "A extrair", PENDING_REVIEW: "Pendente de revisão HSE", APPROVED: "Aprovado", INDEXING: "A indexar", INDEXED: "Indexado", FAILED: "Falha na extração", REJECTED: "Rejeitado", PENDING: "Pendente de revisão" }, emptyValue: "Não identificado", remove: "Remover",
  },
  es: {
    title: "Base de conocimiento de incidentes", subtitle: "Importe PDFs S-EWO históricos y revise los datos extraídos antes de aprobarlos.", upload: "Importar PDFs", uploading: "Importando…", chooseFiles: "Elegir PDFs", uploadHint: "Hasta 5 PDFs por lote, 15 MiB por archivo y 50 MiB en total.", search: "Buscar código o nombre del archivo", loading: "Cargando…", empty: "Todavía no hay documentos en esta planta.", files: "Documentos", document: "Documento", status: "Estado", review: "Revisión HSE", pdf: "PDF original", noPdf: "PDF original no disponible.", source: "Referencia de origen", extracted: "Campos extraídos", incidentType: "Tipo de incidente", incidentCode: "Código S-EWO", incidentDate: "Fecha del incidente", department: "Departamento", workstation: "Puesto / área", equipment: "Equipo", shift: "Turno", operationType: "Operación", description: "Descripción del incidente", mechanism: "Mecanismo del incidente", injuryType: "Tipo de lesión", bodyPart: "Parte del cuerpo", consequence: "Consecuencia", immediateAction: "Acción correctiva inmediata", lessons: "Lecciones aprendidas", previous: "Incidentes relacionados", sifPsif: "Clasificación SIF / PSIF", causes: "Causas", addCause: "Añadir causa", causeCode: "Código original", causeLabel: "Etiqueta original", taxonomy: "Versión original de taxonomía", normalizedCode: "Código normalizado (opcional)", category: "Categoría normalizada (opcional)", causeDescription: "Descripción", assessment: "Evaluación", confirmed: "Causa raíz confirmada", rejected: "Analizada, no confirmada", uncertain: "Incierta", sourcePage: "Página de origen", sourceSection: "Sección de origen", actions: "Acciones correctivas y preventivas", addAction: "Añadir acción", actionDescription: "Acción", actionType: "Tipo de acción", responsible: "Responsable", plannedDate: "Fecha planificada", actualDate: "Fecha real de cierre", actionStatus: "Estado de la acción", unknown: "Desconocido", planned: "Planificada", inProgress: "En curso", completed: "Completada (confirmada)", cancelled: "Cancelada", evidence: "Evidencia de extracción", confidence: "Confianza", save: "Guardar revisión", saving: "Guardando…", approve: "Aprobar", reject: "Rechazar", decisionComment: "Comentario / motivo del rechazo", rejectReason: "Indique el motivo antes de rechazar.", readOnly: "Solo lectura: este perfil ve documentos aprobados con información filtrada por privacidad.", retry: "Reintentar extracción", retrying: "Reintentando…", retryOcr: "No se encontró texto seleccionable. Puede revisar manualmente el PDF original; el OCR automático no está configurado.", saveFirst: "Guarde los cambios antes de decidir.", approveConfirm: "¿Aprobar este incidente revisado?", rejectConfirm: "¿Rechazar este documento?", statusLabels: { UPLOADED: "Cargado", EXTRACTING: "Extrayendo", PENDING_REVIEW: "Pendiente de revisión HSE", APPROVED: "Aprobado", INDEXING: "Indexando", INDEXED: "Indexado", FAILED: "Error de extracción", REJECTED: "Rechazado", PENDING: "Pendiente de revisión" }, emptyValue: "No identificado", remove: "Eliminar",
  },
  fr: {
    title: "Base de connaissances des incidents", subtitle: "Importez des PDF S-EWO historiques et vérifiez les données extraites avant approbation.", upload: "Importer des PDF", uploading: "Importation…", chooseFiles: "Choisir des PDF", uploadHint: "Jusqu’à 5 PDF par lot, 15 Mio par fichier et 50 Mio au total.", search: "Rechercher un code ou un nom de fichier", loading: "Chargement…", empty: "Aucun document dans cette usine pour le moment.", files: "Documents", document: "Document", status: "État", review: "Revue HSE", pdf: "PDF original", noPdf: "PDF original indisponible.", source: "Référence source", extracted: "Champs extraits", incidentType: "Type d’incident", incidentCode: "Code S-EWO", incidentDate: "Date de l’incident", department: "Département", workstation: "Poste / zone", equipment: "Équipement", shift: "Équipe", operationType: "Opération", description: "Description de l’incident", mechanism: "Mécanisme de l’incident", injuryType: "Type de blessure", bodyPart: "Partie du corps", consequence: "Conséquence", immediateAction: "Action corrective immédiate", lessons: "Leçons retenues", previous: "Incidents associés", sifPsif: "Classification SIF / PSIF", causes: "Causes", addCause: "Ajouter une cause", causeCode: "Code original", causeLabel: "Libellé original", taxonomy: "Version de taxonomie originale", normalizedCode: "Code normalisé (facultatif)", category: "Catégorie normalisée (facultatif)", causeDescription: "Description", assessment: "Évaluation", confirmed: "Cause racine confirmée", rejected: "Analysée, non confirmée", uncertain: "Incertaine", sourcePage: "Page source", sourceSection: "Section source", actions: "Actions correctives et préventives", addAction: "Ajouter une action", actionDescription: "Action", actionType: "Type d’action", responsible: "Responsable", plannedDate: "Date prévue", actualDate: "Date réelle de clôture", actionStatus: "État de l’action", unknown: "Inconnu", planned: "Prévue", inProgress: "En cours", completed: "Terminée (confirmée)", cancelled: "Annulée", evidence: "Éléments extraits", confidence: "Confiance", save: "Enregistrer la revue", saving: "Enregistrement…", approve: "Approuver", reject: "Rejeter", decisionComment: "Commentaire / motif du rejet", rejectReason: "Un motif est requis pour rejeter.", readOnly: "Lecture seule : ce profil voit uniquement les documents approuvés avec données filtrées.", retry: "Relancer l’extraction", retrying: "Nouvelle tentative…", retryOcr: "Aucun texte sélectionnable. Consultez le PDF original manuellement; l’OCR automatique n’est pas configuré.", saveFirst: "Enregistrez les corrections avant de décider.", approveConfirm: "Approuver cet incident révisé ?", rejectConfirm: "Rejeter ce document ?", statusLabels: { UPLOADED: "Téléversé", EXTRACTING: "Extraction", PENDING_REVIEW: "En attente de revue HSE", APPROVED: "Approuvé", INDEXING: "Indexation", INDEXED: "Indexé", FAILED: "Échec de l’extraction", REJECTED: "Rejeté", PENDING: "En attente de revue" }, emptyValue: "Non identifié", remove: "Retirer",
  },
  it: {
    title: "Knowledge Base degli incidenti", subtitle: "Importa PDF S-EWO storici e verifica i dati estratti prima dell’approvazione.", upload: "Importa PDF", uploading: "Importazione…", chooseFiles: "Scegli PDF", uploadHint: "Fino a 5 PDF per lotto, 15 MiB per file e 50 MiB totali.", search: "Cerca codice o nome file", loading: "Caricamento…", empty: "Nessun documento per questo stabilimento.", files: "Documenti", document: "Documento", status: "Stato", review: "Revisione HSE", pdf: "PDF originale", noPdf: "PDF originale non disponibile.", source: "Riferimento origine", extracted: "Campi estratti", incidentType: "Tipo di incidente", incidentCode: "Codice S-EWO", incidentDate: "Data incidente", department: "Reparto", workstation: "Postazione / area", equipment: "Attrezzatura", shift: "Turno", operationType: "Operazione", description: "Descrizione dell’incidente", mechanism: "Meccanismo dell’incidente", injuryType: "Tipo di lesione", bodyPart: "Parte del corpo", consequence: "Conseguenza", immediateAction: "Azione correttiva immediata", lessons: "Lezioni apprese", previous: "Incidenti correlati", sifPsif: "Classificazione SIF / PSIF", causes: "Cause", addCause: "Aggiungi causa", causeCode: "Codice originale", causeLabel: "Etichetta originale", taxonomy: "Versione tassonomia originale", normalizedCode: "Codice normalizzato (facoltativo)", category: "Categoria normalizzata (facoltativa)", causeDescription: "Descrizione", assessment: "Valutazione", confirmed: "Causa radice confermata", rejected: "Analizzata, non confermata", uncertain: "Incerta", sourcePage: "Pagina origine", sourceSection: "Sezione origine", actions: "Azioni correttive e preventive", addAction: "Aggiungi azione", actionDescription: "Azione", actionType: "Tipo di azione", responsible: "Responsabile", plannedDate: "Data pianificata", actualDate: "Data effettiva di chiusura", actionStatus: "Stato azione", unknown: "Sconosciuto", planned: "Pianificata", inProgress: "In corso", completed: "Completata (confermata)", cancelled: "Annullata", evidence: "Evidenze estratte", confidence: "Confidenza", save: "Salva revisione", saving: "Salvataggio…", approve: "Approva", reject: "Rifiuta", decisionComment: "Commento / motivo del rifiuto", rejectReason: "Inserisci un motivo prima di rifiutare.", readOnly: "Sola lettura: questo profilo vede documenti approvati con dati filtrati per la privacy.", retry: "Riprova estrazione", retrying: "Nuovo tentativo…", retryOcr: "Nessun testo selezionabile. Consultare manualmente il PDF originale; l’OCR automatico non è configurato.", saveFirst: "Salva le correzioni prima di decidere.", approveConfirm: "Approvare questo incidente revisionato?", rejectConfirm: "Rifiutare il documento?", statusLabels: { UPLOADED: "Caricato", EXTRACTING: "Estrazione", PENDING_REVIEW: "In attesa di revisione HSE", APPROVED: "Approvato", INDEXING: "Indicizzazione", INDEXED: "Indicizzato", FAILED: "Estrazione non riuscita", REJECTED: "Rifiutato", PENDING: "In attesa di revisione" }, emptyValue: "Non identificato", remove: "Rimuovi",
  },
  de: {
    title: "Wissensdatenbank für Vorfälle", subtitle: "Historische S-EWO-PDFs importieren und extrahierte Daten vor der Freigabe prüfen.", upload: "PDFs importieren", uploading: "Wird importiert…", chooseFiles: "PDF-Dateien wählen", uploadHint: "Bis zu 5 PDFs pro Stapel, 15 MiB je Datei, insgesamt 50 MiB.", search: "Code oder Dateiname suchen", loading: "Wird geladen…", empty: "Für dieses Werk sind noch keine Dokumente vorhanden.", files: "Dokumente", document: "Dokument", status: "Status", review: "HSE-Prüfung", pdf: "Original-PDF", noPdf: "Original-PDF nicht verfügbar.", source: "Quellreferenz", extracted: "Extrahierte Felder", incidentType: "Vorfalltyp", incidentCode: "S-EWO-Code", incidentDate: "Vorfallsdatum", department: "Abteilung", workstation: "Arbeitsplatz / Bereich", equipment: "Anlage", shift: "Schicht", operationType: "Arbeitsvorgang", description: "Vorfallbeschreibung", mechanism: "Vorfallmechanismus", injuryType: "Verletzungsart", bodyPart: "Körperteil", consequence: "Folge", immediateAction: "Sofortige Korrekturmaßnahme", lessons: "Erkenntnisse", previous: "Ähnliche Vorfälle", sifPsif: "SIF- / PSIF-Einstufung", causes: "Ursachen", addCause: "Ursache hinzufügen", causeCode: "Originalcode", causeLabel: "Originalbezeichnung", taxonomy: "Originale Taxonomieversion", normalizedCode: "Normalisierter Code (optional)", category: "Normalisierte Kategorie (optional)", causeDescription: "Beschreibung", assessment: "Bewertung", confirmed: "Bestätigte Grundursache", rejected: "Geprüft, nicht bestätigt", uncertain: "Unklar", sourcePage: "Quellseite", sourceSection: "Quellabschnitt", actions: "Korrektur- und Vorbeugungsmaßnahmen", addAction: "Maßnahme hinzufügen", actionDescription: "Maßnahme", actionType: "Maßnahmentyp", responsible: "Verantwortlich", plannedDate: "Geplanter Abschlusstermin", actualDate: "Tatsächlicher Abschlusstermin", actionStatus: "Maßnahmenstatus", unknown: "Unbekannt", planned: "Geplant", inProgress: "In Bearbeitung", completed: "Abgeschlossen (bestätigt)", cancelled: "Abgebrochen", evidence: "Extraktionsbelege", confidence: "Sicherheit", save: "Prüfung speichern", saving: "Wird gespeichert…", approve: "Freigeben", reject: "Ablehnen", decisionComment: "Kommentar / Ablehnungsgrund", rejectReason: "Vor der Ablehnung ist ein Grund erforderlich.", readOnly: "Nur Lesen: Dieses Profil sieht freigegebene, datenschutzgefilterte Informationen.", retry: "Extraktion wiederholen", retrying: "Wird wiederholt…", retryOcr: "Es wurde kein auswählbarer Text gefunden. Das Original-PDF kann manuell geprüft werden; automatische OCR ist nicht konfiguriert.", saveFirst: "Speichern Sie die Korrekturen vor der Entscheidung.", approveConfirm: "Diesen geprüften Vorfall freigeben?", rejectConfirm: "Dieses Dokument ablehnen?", statusLabels: { UPLOADED: "Hochgeladen", EXTRACTING: "Extraktion", PENDING_REVIEW: "HSE-Prüfung ausstehend", APPROVED: "Freigegeben", INDEXING: "Indizierung", INDEXED: "Indiziert", FAILED: "Extraktion fehlgeschlagen", REJECTED: "Abgelehnt", PENDING: "Prüfung ausstehend" }, emptyValue: "Nicht erkannt", remove: "Entfernen",
  },
  ro: {
    title: "Bază de cunoștințe despre incidente", subtitle: "Importați PDF-uri S-EWO istorice și verificați datele extrase înainte de aprobare.", upload: "Importă PDF-uri", uploading: "Se importă…", chooseFiles: "Alegeți PDF-uri", uploadHint: "Maximum 5 PDF-uri pe lot, 15 MiB per fișier și 50 MiB în total.", search: "Căutați codul sau numele fișierului", loading: "Se încarcă…", empty: "Nu există încă documente pentru această fabrică.", files: "Documente", document: "Document", status: "Stare", review: "Revizuire HSE", pdf: "PDF original", noPdf: "PDF-ul original nu este disponibil.", source: "Referință sursă", extracted: "Câmpuri extrase", incidentType: "Tipul incidentului", incidentCode: "Cod S-EWO", incidentDate: "Data incidentului", department: "Departament", workstation: "Post / zonă", equipment: "Echipament", shift: "Schimb", operationType: "Operațiune", description: "Descrierea incidentului", mechanism: "Mecanismul incidentului", injuryType: "Tipul leziunii", bodyPart: "Parte a corpului", consequence: "Consecință", immediateAction: "Acțiune corectivă imediată", lessons: "Lecții învățate", previous: "Incidente asociate", sifPsif: "Clasificare SIF / PSIF", causes: "Cauze", addCause: "Adăugați o cauză", causeCode: "Cod original", causeLabel: "Denumire originală", taxonomy: "Versiune taxonomie originală", normalizedCode: "Cod normalizat (opțional)", category: "Categorie normalizată (opțional)", causeDescription: "Descriere", assessment: "Evaluare", confirmed: "Cauză rădăcină confirmată", rejected: "Analizată, neconfirmată", uncertain: "Nesigură", sourcePage: "Pagina sursă", sourceSection: "Secțiunea sursă", actions: "Acțiuni corective și preventive", addAction: "Adăugați o acțiune", actionDescription: "Acțiune", actionType: "Tip acțiune", responsible: "Responsabil", plannedDate: "Dată planificată", actualDate: "Dată reală de închidere", actionStatus: "Starea acțiunii", unknown: "Necunoscută", planned: "Planificată", inProgress: "În curs", completed: "Finalizată (confirmată)", cancelled: "Anulată", evidence: "Dovezi de extragere", confidence: "Încredere", save: "Salvați revizuirea", saving: "Se salvează…", approve: "Aprobați", reject: "Respingeți", decisionComment: "Comentariu / motivul respingerii", rejectReason: "Este necesar un motiv pentru respingere.", readOnly: "Doar citire: acest profil vede documentele aprobate cu date filtrate pentru confidențialitate.", retry: "Reîncercați extragerea", retrying: "Se reîncearcă…", retryOcr: "Nu a fost găsit text selectabil. PDF-ul original poate fi verificat manual; OCR automat nu este configurat.", saveFirst: "Salvați corecțiile înainte de decizie.", approveConfirm: "Aprobați acest incident revizuit?", rejectConfirm: "Respingeți acest document?", statusLabels: { UPLOADED: "Încărcat", EXTRACTING: "Se extrage", PENDING_REVIEW: "În așteptarea revizuirii HSE", APPROVED: "Aprobat", INDEXING: "Se indexează", INDEXED: "Indexat", FAILED: "Extragere eșuată", REJECTED: "Respins", PENDING: "În așteptarea revizuirii" }, emptyValue: "Neidentificat", remove: "Eliminați",
  },
  pl: {
    title: "Baza wiedzy o incydentach", subtitle: "Importuj historyczne pliki PDF S-EWO i sprawdź wyodrębnione dane przed zatwierdzeniem.", upload: "Importuj pliki PDF", uploading: "Importowanie…", chooseFiles: "Wybierz pliki PDF", uploadHint: "Do 5 plików PDF w partii, 15 MiB na plik i 50 MiB łącznie.", search: "Szukaj kodu lub nazwy pliku", loading: "Ładowanie…", empty: "Brak dokumentów dla tego zakładu.", files: "Dokumenty", document: "Dokument", status: "Status", review: "Weryfikacja HSE", pdf: "Oryginalny PDF", noPdf: "Oryginalny PDF jest niedostępny.", source: "Źródło", extracted: "Wyodrębnione pola", incidentType: "Typ zdarzenia", incidentCode: "Kod S-EWO", incidentDate: "Data zdarzenia", department: "Dział", workstation: "Stanowisko / obszar", equipment: "Urządzenie", shift: "Zmiana", operationType: "Operacja", description: "Opis zdarzenia", mechanism: "Mechanizm zdarzenia", injuryType: "Rodzaj urazu", bodyPart: "Część ciała", consequence: "Skutek", immediateAction: "Natychmiastowe działanie korygujące", lessons: "Wnioski", previous: "Powiązane zdarzenia", sifPsif: "Klasyfikacja SIF / PSIF", causes: "Przyczyny", addCause: "Dodaj przyczynę", causeCode: "Kod źródłowy", causeLabel: "Oryginalna nazwa", taxonomy: "Oryginalna wersja taksonomii", normalizedCode: "Kod ujednolicony (opcjonalnie)", category: "Kategoria ujednolicona (opcjonalnie)", causeDescription: "Opis", assessment: "Ocena", confirmed: "Potwierdzona przyczyna źródłowa", rejected: "Przeanalizowana, niepotwierdzona", uncertain: "Niepewna", sourcePage: "Strona źródłowa", sourceSection: "Sekcja źródłowa", actions: "Działania korygujące i zapobiegawcze", addAction: "Dodaj działanie", actionDescription: "Działanie", actionType: "Rodzaj działania", responsible: "Osoba odpowiedzialna", plannedDate: "Planowany termin", actualDate: "Rzeczywista data zamknięcia", actionStatus: "Status działania", unknown: "Nieznany", planned: "Zaplanowane", inProgress: "W toku", completed: "Zakończone (potwierdzone)", cancelled: "Anulowane", evidence: "Dowody ekstrakcji", confidence: "Pewność", save: "Zapisz weryfikację", saving: "Zapisywanie…", approve: "Zatwierdź", reject: "Odrzuć", decisionComment: "Komentarz / powód odrzucenia", rejectReason: "Podaj powód odrzucenia.", readOnly: "Tylko do odczytu: profil widzi zatwierdzone dokumenty z filtrowanymi danymi.", retry: "Ponów ekstrakcję", retrying: "Ponawianie…", retryOcr: "Nie znaleziono tekstu do zaznaczenia. Oryginalny PDF można sprawdzić ręcznie; automatyczny OCR nie jest skonfigurowany.", saveFirst: "Zapisz poprawki przed podjęciem decyzji.", approveConfirm: "Zatwierdzić zweryfikowany incydent?", rejectConfirm: "Odrzucić dokument?", statusLabels: { UPLOADED: "Przesłano", EXTRACTING: "Ekstrakcja", PENDING_REVIEW: "Oczekuje na weryfikację HSE", APPROVED: "Zatwierdzono", INDEXING: "Indeksowanie", INDEXED: "Zindeksowano", FAILED: "Błąd ekstrakcji", REJECTED: "Odrzucono", PENDING: "Oczekuje na weryfikację" }, emptyValue: "Nie ustalono", remove: "Usuń",
  },
};

const EMPTY_RECORD: RecordDraft = {
  incidentCode: "", incidentDate: "", department: "", workstation: "", equipment: "", shift: "",
  operationType: "", occurrenceDescription: "", occurrenceMechanism: "", injuryType: "", bodyPart: "",
  consequence: "", immediateCorrectiveAction: "", lessonsLearned: "", previousRelatedOccurrences: "", sifPsifClassification: "",
};

const RECORD_FIELDS: Array<[keyof RecordDraft, keyof Copy]> = [
  ["incidentCode", "incidentCode"], ["incidentDate", "incidentDate"], ["department", "department"],
  ["workstation", "workstation"], ["equipment", "equipment"], ["shift", "shift"], ["operationType", "operationType"],
  ["occurrenceDescription", "description"], ["occurrenceMechanism", "mechanism"], ["injuryType", "injuryType"],
  ["bodyPart", "bodyPart"], ["consequence", "consequence"], ["immediateCorrectiveAction", "immediateAction"],
  ["lessonsLearned", "lessons"], ["previousRelatedOccurrences", "previous"], ["sifPsifClassification", "sifPsif"],
];

function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function toCauseDraft(cause?: Partial<CauseResponse>): CauseDraft {
  return {
    originalCauseCode: cause?.originalCauseCode ?? "", originalCauseLabel: cause?.originalCauseLabel ?? "",
    originalTaxonomyVersion: cause?.originalTaxonomyVersion ?? "", normalizedCauseCode: cause?.normalizedCauseCode ?? "",
    normalizedCategory: cause?.normalizedCategory ?? "", description: cause?.description ?? "",
    assessmentStatus: cause?.assessmentStatus ?? "UNCERTAIN", sourcePage: cause?.sourcePage == null ? "" : String(cause.sourcePage),
    sourceSection: cause?.sourceSection ?? "",
  };
}

function toActionDraft(action?: Partial<ActionResponse>): ActionDraft {
  return {
    description: action?.description ?? "", actionType: action?.actionType ?? "", responsible: action?.responsible ?? "",
    plannedClosureDate: toDateInput(action?.plannedClosureDate), actualClosureDate: toDateInput(action?.actualClosureDate),
    status: action?.status ?? "UNKNOWN", sourcePage: action?.sourcePage == null ? "" : String(action.sourcePage), sourceSection: action?.sourceSection ?? "",
  };
}

async function readData<T>(response: Response): Promise<T> {
  const result = await response.json() as { ok?: boolean; data?: T; message?: string };
  if (!response.ok || !result.ok || result.data === undefined) throw new Error(result.message ?? "Request failed.");
  return result.data;
}

export function IncidentKnowledgeWorkspace({
  plants,
  storagePlantCode,
  locale,
  canManage,
  initialDocumentId,
  initialDocumentPlantCode,
}: {
  plants: WorkspacePlant[];
  storagePlantCode: string;
  locale: string;
  canManage: boolean;
  initialDocumentId: string | null;
  initialDocumentPlantCode: string;
}) {
  const t = COPY[(locale in COPY ? locale : "en") as Locale];
  const emptyMessage = locale === "pt" ? "Ainda não existem relatórios na Base de Conhecimento transversal." : "No reports have been added to the shared Knowledge Base yet.";
  const baseForPlant = useCallback((code: string) => `/api/plants/${encodeURIComponent(code)}/incident-knowledge`, []);
  const plantCodes = useMemo(() => plants.map((plant) => plant.code), [plants]);
  const [documents, setDocuments] = useState<ListDocument[]>([]);
  const [listPages, setListPages] = useState<Record<string, { nextSkip: number; hasMore: boolean }>>({});
  const [activeId, setActiveId] = useState<string | null>(initialDocumentId);
  const [activePlantCode, setActivePlantCode] = useState(initialDocumentPlantCode);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [record, setRecord] = useState<RecordDraft>(EMPTY_RECORD);
  const [incidentType, setIncidentType] = useState("");
  const [causes, setCauses] = useState<CauseDraft[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);
  const [query, setQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [decisionComment, setDecisionComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = baseForPlant(activePlantCode || storagePlantCode || plantCodes[0] || "");

  const refreshList = useCallback(async (search = query) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const perPlant = await Promise.all(plants.map(async (plant) => {
      const data = await readData<{ documents: Omit<ListDocument, "plantCode" | "plantName">[]; nextSkip: number; hasMore: boolean }>(await fetch(`${baseForPlant(plant.code)}?${params.toString()}`, { cache: "no-store" }));
      return { documents: data.documents.map((document) => ({ ...document, plantCode: plant.code, plantName: plant.name })), nextSkip: data.nextSkip, hasMore: data.hasMore, plantCode: plant.code };
    }));
    const allDocuments = perPlant.flatMap((entry) => entry.documents).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    setDocuments(allDocuments);
    setListPages(Object.fromEntries(perPlant.map((entry) => [entry.plantCode, { nextSkip: entry.nextSkip, hasMore: entry.hasMore }])));
    const selected = allDocuments.find((document) => document.id === activeId)
      ?? allDocuments.find((document) => document.id === initialDocumentId)
      ?? (activeId ? null : allDocuments[0] ?? null);
    const preserveDirectLink = !selected && !search.trim() && activeId === initialDocumentId && Boolean(initialDocumentPlantCode);
    setActiveId(selected?.id ?? (preserveDirectLink ? activeId : null));
    setActivePlantCode(selected?.plantCode ?? (preserveDirectLink ? initialDocumentPlantCode : ""));
  }, [activeId, baseForPlant, initialDocumentId, initialDocumentPlantCode, plants, query]);

  async function loadOlderDocuments() {
    const plantsWithMore = plants.filter((plant) => listPages[plant.code]?.hasMore);
    if (!plantsWithMore.length) return;
    setBusy(true);
    setError(null);
    try {
      const paramsBase = new URLSearchParams();
      if (query.trim()) paramsBase.set("q", query.trim());
      const pages = await Promise.all(plantsWithMore.map(async (plant) => {
        const skip = listPages[plant.code].nextSkip;
        const params = new URLSearchParams(paramsBase);
        params.set("skip", String(skip));
        const data = await readData<{ documents: Omit<ListDocument, "plantCode" | "plantName">[]; nextSkip: number; hasMore: boolean }>(await fetch(`${baseForPlant(plant.code)}?${params.toString()}`, { cache: "no-store" }));
        return { plant, documents: data.documents.map((document) => ({ ...document, plantCode: plant.code, plantName: plant.name })), nextSkip: data.nextSkip, hasMore: data.hasMore };
      }));
      setDocuments((current) => [...current, ...pages.flatMap((page) => page.documents)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      setListPages((current) => ({ ...current, ...Object.fromEntries(pages.map((page) => [page.plant.code, { nextSkip: page.nextSkip, hasMore: page.hasMore }])) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load older reports.");
    } finally {
      setBusy(false);
    }
  }

  const loadDetail = useCallback(async (id: string, keepCurrent = false) => {
    if (!keepCurrent) setDetail(null);
    const documentPlantCode = documents.find((document) => document.id === id)?.plantCode || activePlantCode;
    if (!documentPlantCode) throw new Error("A origem deste relatório não foi identificada.");
    const data = await readData<{ document: Detail }>(await fetch(`${baseForPlant(documentPlantCode)}/${encodeURIComponent(id)}`, { cache: "no-store" }));
    const selected = data.document;
    setDetail(selected);
    setIncidentType(selected.incidentType ?? "");
    setRecord({
      ...EMPTY_RECORD,
      ...(selected.record ?? {}),
      incidentDate: toDateInput(selected.record?.incidentDate ?? selected.incidentDate),
    });
    setCauses((selected.record?.causes ?? []).map((cause) => toCauseDraft(cause)));
    setActions((selected.record?.actions ?? []).map((action) => toActionDraft(action)));
    setDecisionComment(selected.reviewComment ?? "");
  }, [activePlantCode, baseForPlant, documents]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshList().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load documents.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshList]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setError(null);
    loadDetail(activeId).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this document.");
    });
    return () => { cancelled = true; };
  }, [activeId, loadDetail]);

  useEffect(() => {
    if (!activeId || !["UPLOADED", "EXTRACTING"].includes(detail?.extractionStatus ?? "")) return;
    let active = true;
    const timer = setInterval(() => {
      void Promise.all([refreshList(), loadDetail(activeId, true)]).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not refresh extraction status.");
      });
    }, 2_500);
    return () => { active = false; clearInterval(timer); };
  }, [activeId, detail?.extractionStatus, loadDetail, refreshList]);

  const activeDocument = useMemo(() => documents.find((document) => document.id === activeId) ?? null, [activeId, documents]);
  const activePlant = plants.find((plant) => plant.code === activePlantCode) ?? null;
  const hasMoreDocuments = Object.values(listPages).some((page) => page.hasMore);
  const globalOriginLabel = locale === "pt" ? "Base transversal" : "Shared knowledge base";
  const editable = canManage
    && detail?.reviewStatus !== "APPROVED"
    && detail?.reviewStatus !== "REJECTED"
    && !["UPLOADED", "EXTRACTING", "INDEXING"].includes(detail?.extractionStatus ?? "");
  const statusLabel = (status: string) => t.statusLabels[status] ?? status.replaceAll("_", " ");

  async function uploadFiles() {
    if (!selectedFiles.length) return;
    if (!storagePlantCode) {
      setError(locale === "pt" ? "A Base de Conhecimento global ainda não está configurada." : "The global Knowledge Base is not configured yet.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      const chunks: File[][] = [];
      let chunk: File[] = [];
      let chunkBytes = 0;
      for (const file of selectedFiles) {
        if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 15 * 1024 * 1024) {
          throw new Error(locale === "pt" ? `${file.name}: selecione PDFs até 15 MiB.` : `${file.name}: select PDF files up to 15 MiB.`);
        }
        if (chunk.length && (chunk.length >= 5 || chunkBytes + file.size > 50 * 1024 * 1024)) {
          chunks.push(chunk);
          chunk = [];
          chunkBytes = 0;
        }
        chunk.push(file);
        chunkBytes += file.size;
      }
      if (chunk.length) chunks.push(chunk);

      let completedFiles = 0;
      let queuedCount = 0;
      let firstDocumentId: string | null = null;
      for (let index = 0; index < chunks.length; index += 1) {
        const form = new FormData();
        chunks[index].forEach((file) => form.append("files", file));
        try {
          const data = await readData<{ documents: Array<{ id: string }>; queuedCount: number }>(await fetch(baseForPlant(storagePlantCode), { method: "POST", body: form }));
          completedFiles += chunks[index].length;
          queuedCount += data.queuedCount;
          firstDocumentId ??= data.documents[0]?.id ?? null;
          setNotice(locale === "pt"
            ? `A importar relatórios: ${completedFiles} de ${selectedFiles.length} (${index + 1}/${chunks.length} lotes).`
            : `Importing reports: ${completedFiles} of ${selectedFiles.length} (${index + 1}/${chunks.length} batches).`);
        } catch (reason) {
          setSelectedFiles(selectedFiles.slice(completedFiles));
          setError(`${reason instanceof Error ? reason.message : "Upload failed."}${completedFiles ? (locale === "pt" ? ` Já foram importados ${completedFiles} relatório(s); os restantes continuam selecionados.` : ` ${completedFiles} reports were imported; the remaining files are still selected.`) : ""}`);
          await refreshList();
          return;
        }
      }
      setSelectedFiles([]);
      setNotice(locale === "pt"
        ? `${completedFiles} relatório(s) importado(s); ${queuedCount} colocado(s) na fila de extração.`
        : `${completedFiles} report(s) imported; ${queuedCount} queued for extraction.`);
      await refreshList();
      if (firstDocumentId) {
        setActivePlantCode(storagePlantCode);
        setActiveId(firstDocumentId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function saveReview(showNotice = true, reloadDetail = true) {
    if (!detail || !editable) return false;
    const payload = {
      incidentType: incidentType.trim() || null,
      record: Object.fromEntries(RECORD_FIELDS.map(([field]) => [field, record[field].trim() || null])),
      causes: causes.map((cause) => ({
        originalCauseCode: cause.originalCauseCode.trim() || null,
        originalCauseLabel: cause.originalCauseLabel.trim() || null,
        originalTaxonomyVersion: cause.originalTaxonomyVersion.trim() || null,
        normalizedCauseCode: cause.normalizedCauseCode.trim() || null,
        normalizedCategory: cause.normalizedCategory.trim() || null,
        description: cause.description.trim() || null,
        assessmentStatus: cause.assessmentStatus,
        sourcePage: cause.sourcePage.trim() && Number.isInteger(Number(cause.sourcePage)) ? Number(cause.sourcePage) : null,
        sourceSection: cause.sourceSection.trim() || null,
      })),
      actions: actions.filter((action) => action.description.trim()).map((action) => ({
        description: action.description.trim(), actionType: action.actionType.trim() || null,
        responsible: action.responsible.trim() || null, plannedClosureDate: action.plannedClosureDate || null,
        actualClosureDate: action.actualClosureDate || null, status: action.status,
        sourcePage: action.sourcePage.trim() && Number.isInteger(Number(action.sourcePage)) ? Number(action.sourcePage) : null,
        sourceSection: action.sourceSection.trim() || null,
      })),
    };
    try {
      await readData(await fetch(`${base}/${encodeURIComponent(detail.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      }));
      if (showNotice) setNotice("Review fields saved.");
      if (reloadDetail) await loadDetail(detail.id);
      await refreshList();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the review.");
      return false;
    }
  }

  async function saveReviewAction() {
    setBusy(true);
    try { await saveReview(); } finally { setBusy(false); }
  }

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!detail) return;
    if (decision === "REJECT" && !decisionComment.trim()) {
      setError(t.rejectReason);
      return;
    }
    if (decision === "APPROVE" && !window.confirm(t.approveConfirm)) return;
    if (decision === "REJECT" && !window.confirm(t.rejectConfirm)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (!await saveReview(false, false)) throw new Error(t.saveFirst);
      await readData(await fetch(`${base}/${encodeURIComponent(detail.id)}/decision`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comment: decisionComment.trim() || null }),
      }));
      setNotice(decision === "APPROVE" ? "Document approved." : "Document rejected.");
      await refreshList();
      await loadDetail(detail.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this decision.");
    } finally { setBusy(false); }
  }

  async function retryExtraction() {
    if (!detail) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await readData(await fetch(`${base}/${encodeURIComponent(detail.id)}/retry`, { method: "POST" }));
      setNotice("Extraction retry queued.");
      await refreshList();
      await loadDetail(detail.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not retry extraction.");
    } finally { setBusy(false); }
  }

  async function reindexDocument() {
    if (!detail) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await readData(await fetch(`${base}/${encodeURIComponent(detail.id)}/reindex`, { method: "POST" }));
      setNotice(locale === "pt" ? "Reindexação da pesquisa colocada na fila." : "Search reindexing queued.");
      await refreshList();
      await loadDetail(detail.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue search reindexing.");
    } finally { setBusy(false); }
  }

  async function reindexApprovedDocuments() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const results = await Promise.all(plants.map(async (plant) => readData<{ queuedCount: number }>(await fetch(`${baseForPlant(plant.code)}/reindex`, { method: "POST" }))));
      const queuedCount = results.reduce((total, data) => total + data.queuedCount, 0);
      setNotice(locale === "pt"
        ? `${queuedCount} documento(s) aprovado(s) colocado(s) na fila de indexação.`
        : `${queuedCount} approved document(s) queued for indexing.`);
      await refreshList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue approved documents for indexing.");
    } finally { setBusy(false); }
  }

  function setRecordField(field: keyof RecordDraft, value: string) {
    setRecord((current) => ({ ...current, [field]: value }));
  }

  function fieldInput(field: keyof RecordDraft, labelKey: keyof Copy) {
    const multiline = ["occurrenceDescription", "occurrenceMechanism", "consequence", "immediateCorrectiveAction", "lessonsLearned", "previousRelatedOccurrences"].includes(field);
    const date = field === "incidentDate";
    const common = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-600";
    return (
      <label key={field} className="block text-xs font-semibold text-slate-600">
        {t[labelKey] as string}
        {multiline ? <textarea rows={3} className={common} disabled={!editable} value={record[field]} onChange={(event) => setRecordField(field, event.target.value)} />
          : <input type={date ? "date" : "text"} className={common} disabled={!editable} value={record[field]} onChange={(event) => setRecordField(field, event.target.value)} />}
      </label>
    );
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-600";

  return (
    <main className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold text-slate-900">{t.title}</h1><p className="mt-1 text-sm text-slate-500">{locale === "pt" ? "N0 · Base transversal a todas as plantas" : "N0 · Shared across all plants"}</p><p className="mt-2 text-sm text-slate-600">{t.subtitle}</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{t.files}: {documents.length}{hasMoreDocuments ? "+" : ""}</span>
        </div>
        {canManage ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
          <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">{t.chooseFiles}
            <input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800" />
          </label>
          <button type="button" disabled={busy || !selectedFiles.length || !storagePlantCode} onClick={uploadFiles} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? t.uploading : t.upload}</button>
          <button type="button" disabled={busy} onClick={reindexApprovedDocuments} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-50">{locale === "pt" ? "Reindexar aprovados" : "Reindex approved"}</button>
          <span className="w-full text-xs text-slate-500">{t.uploadHint}</span>
          <span className="w-full text-xs text-slate-500">{locale === "pt" ? "Selecione relatórios de qualquer planta em conjunto. Não é necessário separar por planta; o envio é dividido automaticamente em lotes de até 5 PDFs e 50 MiB." : "Select reports from any plants together. No plant-by-plant separation is needed; uploads are automatically split into batches of up to 5 PDFs and 50 MiB."}{selectedFiles.length ? ` · ${selectedFiles.length} ${locale === "pt" ? "ficheiro(s) selecionado(s)" : "file(s) selected"}` : ""}</span>
          <span className="w-full text-xs text-slate-500">{locale === "pt"
            ? "Os S-EWO aprovados no software são associados automaticamente à Base de Conhecimento e ficam disponíveis ao agente após indexação."
            : "S-EWOs approved in the software are associated automatically with the Knowledge Base and become available to the agent after indexing."}</span>
        </div> : <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{t.readOnly}</p>}
      </header>

      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <IncidentKnowledgeSearchPanel
        storagePlantCode={storagePlantCode}
        locale={locale}
        onOpenDocument={(sourcePlantCode, documentId) => {
          setActivePlantCode(sourcePlantCode);
          setActiveId(documentId);
          window.setTimeout(() => document.getElementById("incident-knowledge-review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        }}
      />

      <div id="incident-knowledge-review" className="grid scroll-mt-4 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">{t.files}</h2>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setLoading(true); refreshList(query).catch((reason) => setError(reason instanceof Error ? reason.message : "Search failed.")).finally(() => setLoading(false)); } }} placeholder={t.search} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <button type="button" onClick={() => { setLoading(true); refreshList(query).catch((reason) => setError(reason instanceof Error ? reason.message : "Search failed.")).finally(() => setLoading(false)); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t.search}</button>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
            {loading ? <p className="p-3 text-sm text-slate-500">{t.loading}</p> : null}
            {!loading && !documents.length ? <p className="p-3 text-sm text-slate-500">{emptyMessage}</p> : null}
            {documents.map((document) => <button key={document.id} type="button" onClick={() => { setActivePlantCode(document.plantCode); setActiveId(document.id); }} className={`w-full rounded-xl border p-3 text-left transition ${activeId === document.id ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
              <span className="block truncate text-sm font-semibold text-slate-900">{document.record?.incidentCode || document.sourceReference || document.originalFilename || document.id}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{document.record?.department || document.incidentType || document.originalFilename || "—"}</span>
              <span className="mt-1 block truncate text-xs font-medium text-blue-800">{document.sourceType === "HISTORICAL_PDF" ? globalOriginLabel : `${document.plantName} · ${document.plantCode}`}</span>
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{statusLabel(document.extractionStatus)}</span>
              {document.lastError ? <span className="mt-2 block line-clamp-2 text-xs text-amber-800">{document.lastError}</span> : null}
            </button>)}
          </div>
          {hasMoreDocuments ? <button type="button" disabled={busy || loading} onClick={loadOlderDocuments} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{locale === "pt" ? "Carregar relatórios anteriores" : "Load older reports"}</button> : null}
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!detail ? <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">{documents.length ? t.loading : emptyMessage}</div> : <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{activeDocument?.record?.incidentCode || detail.sourceReference || detail.originalFilename || t.document}</h2><p className="mt-1 text-sm text-slate-500">{detail.sourceType === "HISTORICAL_PDF" ? globalOriginLabel : `${activeDocument?.plantName || activePlant?.name} · ${activeDocument?.plantCode || activePlantCode}`} · {detail.originalFilename}</p></div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{statusLabel(detail.extractionStatus)}</span>
            </div>
            {detail.lastError ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{detail.lastError}</p> : null}
            {canManage && detail.extractionStatus === "FAILED" && detail.lastError?.includes("no usable text layer") ? <p className="mt-2 text-sm text-amber-900">{t.retryOcr}</p> : null}
            {canManage && (detail.extractionStatus === "FAILED" && !detail.lastError?.includes("no usable text layer")
              || detail.extractionStatus === "PENDING_REVIEW" && (detail.lastError?.startsWith("Local structured extraction failed") || detail.lastError?.startsWith("Local structured extraction timed out")))
              ? <button type="button" disabled={busy} onClick={retryExtraction} className="mt-3 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">{busy ? t.retrying : t.retry}</button>
              : null}
            {canManage && detail.reviewStatus === "APPROVED" && detail.extractionStatus === "APPROVED"
              ? <button type="button" disabled={busy} onClick={reindexDocument} className="mt-3 ml-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-900 disabled:opacity-50">{busy ? t.retrying : locale === "pt" ? "Reindexar pesquisa" : "Reindex search"}</button>
              : null}

            <div className="mt-4 grid min-w-0 gap-4 2xl:grid-cols-2">
              <section className="min-w-0">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">{t.pdf}</h3>
                {canManage ? <iframe title={t.pdf} src={`${base}/${encodeURIComponent(detail.id)}/file`} className="h-[70vh] min-h-[38rem] w-full rounded-lg border border-slate-300 bg-slate-100" /> : <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">{t.noPdf}</div>}
              </section>

              <section className="min-w-0 space-y-4 2xl:max-h-[70vh] 2xl:overflow-y-auto 2xl:pr-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">{t.extracted}</h3>
                  <label className="mb-3 block text-xs font-semibold text-slate-600">{t.incidentType}<input className={inputClass} disabled={!editable} value={incidentType} onChange={(event) => setIncidentType(event.target.value)} /></label>
                  <div className="grid gap-3 sm:grid-cols-2">{RECORD_FIELDS.map(([field, label]) => fieldInput(field, label))}</div>
                  {detail.record?.extractionConfidence !== null && detail.record?.extractionConfidence !== undefined ? <p className="mt-3 text-xs text-slate-500">{t.confidence}: {Math.round(detail.record.extractionConfidence * 100)}%</p> : null}
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{t.causes}</h3>{editable ? <button type="button" onClick={() => setCauses((current) => [...current, toCauseDraft()])} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold">{t.addCause}</button> : null}</div>
                  {!causes.length ? <p className="text-sm text-slate-500">{t.emptyValue}</p> : null}
                  <div className="space-y-3">{causes.map((cause, index) => <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600">{t.causeCode}<input className={inputClass} disabled={!editable} value={cause.originalCauseCode} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, originalCauseCode: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.causeLabel}<input className={inputClass} disabled={!editable} value={cause.originalCauseLabel} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, originalCauseLabel: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.taxonomy}<input className={inputClass} disabled={!editable} value={cause.originalTaxonomyVersion} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, originalTaxonomyVersion: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.assessment}<select className={inputClass} disabled={!editable} value={cause.assessmentStatus} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, assessmentStatus: event.target.value as CauseStatus } : item))}><option value="CONFIRMED">{t.confirmed}</option><option value="REJECTED">{t.rejected}</option><option value="UNCERTAIN">{t.uncertain}</option></select></label>
                    <label className="text-xs font-semibold text-slate-600">{t.normalizedCode}<input className={inputClass} disabled={!editable} value={cause.normalizedCauseCode} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, normalizedCauseCode: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.category}<input className={inputClass} disabled={!editable} value={cause.normalizedCategory} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, normalizedCategory: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{t.causeDescription}<textarea rows={2} className={inputClass} disabled={!editable} value={cause.description} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.sourcePage}<input type="number" min={1} className={inputClass} disabled={!editable} value={cause.sourcePage} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, sourcePage: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.sourceSection}<input className={inputClass} disabled={!editable} value={cause.sourceSection} onChange={(event) => setCauses((current) => current.map((item, i) => i === index ? { ...item, sourceSection: event.target.value } : item))} /></label>
                    {editable ? <button type="button" onClick={() => setCauses((current) => current.filter((_, i) => i !== index))} className="justify-self-start text-xs font-semibold text-red-700">{t.remove}</button> : null}
                  </div>)}</div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{t.actions}</h3>{editable ? <button type="button" onClick={() => setActions((current) => [...current, toActionDraft()])} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold">{t.addAction}</button> : null}</div>
                  {!actions.length ? <p className="text-sm text-slate-500">{t.emptyValue}</p> : null}
                  <div className="space-y-3">{actions.map((action, index) => <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{t.actionDescription}<textarea rows={2} className={inputClass} disabled={!editable} value={action.description} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.actionType}<input className={inputClass} disabled={!editable} value={action.actionType} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, actionType: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.responsible}<input className={inputClass} disabled={!editable} value={action.responsible} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, responsible: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.plannedDate}<input type="date" className={inputClass} disabled={!editable} value={action.plannedClosureDate} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, plannedClosureDate: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.actualDate}<input type="date" className={inputClass} disabled={!editable} value={action.actualClosureDate} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, actualClosureDate: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.actionStatus}<select className={inputClass} disabled={!editable} value={action.status} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, status: event.target.value as ActionStatus } : item))}><option value="UNKNOWN">{t.unknown}</option><option value="PLANNED">{t.planned}</option><option value="IN_PROGRESS">{t.inProgress}</option><option value="COMPLETED">{t.completed}</option><option value="CANCELLED">{t.cancelled}</option></select></label>
                    <label className="text-xs font-semibold text-slate-600">{t.sourcePage}<input type="number" min={1} className={inputClass} disabled={!editable} value={action.sourcePage} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, sourcePage: event.target.value } : item))} /></label>
                    <label className="text-xs font-semibold text-slate-600">{t.sourceSection}<input className={inputClass} disabled={!editable} value={action.sourceSection} onChange={(event) => setActions((current) => current.map((item, i) => i === index ? { ...item, sourceSection: event.target.value } : item))} /></label>
                    {editable ? <button type="button" onClick={() => setActions((current) => current.filter((_, i) => i !== index))} className="justify-self-start text-xs font-semibold text-red-700">{t.remove}</button> : null}
                  </div>)}</div>
                </div>

                {detail.record?.evidences?.length && canManage ? <div className="rounded-xl border border-slate-200 p-3"><h3 className="mb-3 text-sm font-semibold text-slate-800">{t.evidence}</h3><div className="space-y-2">{detail.record.evidences.map((evidence) => <div key={evidence.id} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700"><p className="font-semibold">{evidence.fieldName}{evidence.sourcePage ? ` · ${t.sourcePage} ${evidence.sourcePage}` : ""}{evidence.confidence !== null ? ` · ${t.confidence}: ${Math.round(evidence.confidence * 100)}%` : ""}</p><p className="mt-1 whitespace-pre-wrap">{evidence.supportingExcerpt || evidence.extractedValue || t.emptyValue}</p></div>)}</div></div> : null}

                {editable ? <div className="sticky bottom-0 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <label className="block text-xs font-semibold text-slate-600">{t.decisionComment}<textarea rows={2} className={inputClass} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} /></label>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={saveReviewAction} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">{busy ? t.saving : t.save}</button><button type="button" disabled={busy} onClick={() => decide("APPROVE")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t.approve}</button><button type="button" disabled={busy} onClick={() => decide("REJECT")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t.reject}</button></div>
                </div> : null}
              </section>
            </div>
          </>}
        </section>
      </div>
    </main>
  );
}
