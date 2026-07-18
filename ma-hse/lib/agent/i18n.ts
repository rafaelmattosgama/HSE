import { locales, type AppLocale } from "@/lib/i18n/routing";

type AgentUiCopy = {
  openChat: string;
  title: string;
  closeChat: string;
  close: string;
  welcome: string;
  contactError: string;
  noResponse: string;
  genericError: string;
  confirmationError: string;
  confirmationExecuted: string;
  confirmationExecutedWithSummary: string;
  confirmationCancelled: string;
  confirmationCancelledWithSummary: string;
  confirmationRequired: string;
  completed: string;
  statusChanged: string;
  processing: string;
  pendingConfirmation: string;
  confirm: string;
  cancel: string;
  messageLabel: string;
  placeholder: string;
  send: string;
  truncated: string;
};

type AgentErrorCopy = {
  unavailable: string;
  disabled: string;
  forbidden: string;
  invalidRequest: string;
  rateLimited: string;
  timeout: string;
  authenticationRequired: string;
  plantRequired: string;
  confirmationExpired: string;
  confirmationCancelled: string;
  confirmationConfirmed: string;
};

type AgentMockCopy = {
  operationFailed: string;
  noOpenActions: string;
  openActionsFound: string;
  dueDate: string;
  noCommunications: string;
  communicationsFound: string;
  noDescription: string;
  kpisFound: string;
  noOverdueActions: string;
  overdueActionsFound: string;
  reportGenerated: string;
  metadataAvailable: string;
  specifyActionPriority: string;
  actionUpdated: string;
  specifyActionToClose: string;
  confirmationRequired: string;
  closureComment: string;
  help: string;
};

export type InternalAgentCopy = {
  locale: AppLocale;
  languageName: string;
  ui: AgentUiCopy;
  errors: AgentErrorCopy;
  mock: AgentMockCopy;
  closeActionSummary: string;
};

const COPY: Record<AppLocale, InternalAgentCopy> = {
  en: {
    locale: "en",
    languageName: "English",
    ui: {
      openChat: "Open internal agent chat",
      title: "Internal agent",
      closeChat: "Close chat",
      close: "Close",
      welcome: "How can I help at this plant?",
      contactError: "The internal agent could not be reached.",
      noResponse: "The agent did not return a response.",
      genericError: "An error occurred while contacting the agent.",
      confirmationError: "The confirmation could not be processed.",
      confirmationExecuted: "Confirmation completed.",
      confirmationExecutedWithSummary: "Confirmed: {summary}",
      confirmationCancelled: "Confirmation cancelled.",
      confirmationCancelledWithSummary: "Cancelled: {summary}",
      confirmationRequired: "This action requires confirmation.",
      completed: "Request completed.",
      statusChanged: "{title} now has status {status}.",
      processing: "Processing...",
      pendingConfirmation: "Confirm the pending action?",
      confirm: "Confirm",
      cancel: "Cancel",
      messageLabel: "Message",
      placeholder: "Write a message...",
      send: "Send message",
      truncated: "Response shortened for safety. Rephrase the request to receive a shorter answer.",
    },
    errors: {
      unavailable: "The internal agent is temporarily unavailable. Please try again later.",
      disabled: "The internal agent is not available in this environment.",
      forbidden: "You do not have permission to use the internal agent at this plant.",
      invalidRequest: "The request sent to the agent is invalid.",
      rateLimited: "Too many requests. Please try again in a few seconds.",
      timeout: "The agent took too long to respond. Please try again.",
      authenticationRequired: "Authentication is required to use the internal agent.",
      plantRequired: "Select a plant before using the internal agent.",
      confirmationExpired: "The confirmation expired. Ask the agent to prepare the action again.",
      confirmationCancelled: "This confirmation has already been cancelled.",
      confirmationConfirmed: "This confirmation has already been completed.",
    },
    mock: {
      operationFailed: "The requested operation could not be completed.",
      noOpenActions: "I found no open actions at this plant.",
      openActionsFound: "I found {count} open action(s) at this plant:",
      dueDate: "due {date}",
      noCommunications: "I found no communications at this plant.",
      communicationsFound: "I found {count} communication(s) at this plant:",
      noDescription: "no description",
      kpisFound: "KPIs retrieved for this plant:",
      noOverdueActions: "I found no overdue actions at this plant.",
      overdueActionsFound: "I found {count} overdue action(s) at this plant:",
      reportGenerated: "Report generated{period}: {title}.",
      metadataAvailable: "metadata available",
      specifyActionPriority: "Specify the action and priority. Example: update action ACT-1 to high priority.",
      actionUpdated: "Action updated: {reference} - {title} ({priority}).",
      specifyActionToClose: "Specify the action UUID or action number/code at this plant so I can prepare its closure.",
      confirmationRequired: "This action requires confirmation before execution.",
      closureComment: "Closure prepared by the mock/development agent. Explicit confirmation is required.",
      help: "Mock/development mode is active. Supported commands: list open actions, overdue actions, list communications, KPIs, update an action priority, generate the current month report, and close an action.",
    },
    closeActionSummary: "Close action \"{title}\" ({id}) with comment: {comment}",
  },
  pt: {
    locale: "pt",
    languageName: "Portuguese (Portugal)",
    ui: {
      openChat: "Abrir chat do agente interno",
      title: "Agente interno",
      closeChat: "Fechar chat",
      close: "Fechar",
      welcome: "Como posso ajudar nesta fábrica?",
      contactError: "Não foi possível contactar o agente interno.",
      noResponse: "O agente não devolveu uma resposta.",
      genericError: "Ocorreu um erro ao contactar o agente.",
      confirmationError: "Não foi possível processar a confirmação.",
      confirmationExecuted: "Confirmação executada.",
      confirmationExecutedWithSummary: "Confirmado: {summary}",
      confirmationCancelled: "Confirmação cancelada.",
      confirmationCancelledWithSummary: "Cancelado: {summary}",
      confirmationRequired: "Esta ação exige confirmação.",
      completed: "Pedido concluído.",
      statusChanged: "{title} ficou com o estado {status}.",
      processing: "A processar...",
      pendingConfirmation: "Confirmar a ação pendente?",
      confirm: "Confirmar",
      cancel: "Cancelar",
      messageLabel: "Mensagem",
      placeholder: "Escreva uma mensagem...",
      send: "Enviar mensagem",
      truncated: "Resposta truncada por segurança. Reformule o pedido para obter uma resposta mais curta.",
    },
    errors: {
      unavailable: "O agente interno está temporariamente indisponível. Tente novamente mais tarde.",
      disabled: "O agente interno não está disponível neste ambiente.",
      forbidden: "Não tem permissão para usar o agente interno nesta fábrica.",
      invalidRequest: "O pedido enviado ao agente é inválido.",
      rateLimited: "Demasiados pedidos. Tente novamente dentro de alguns segundos.",
      timeout: "O agente demorou demasiado tempo a responder. Tente novamente.",
      authenticationRequired: "É necessário iniciar sessão para utilizar o agente interno.",
      plantRequired: "Selecione uma fábrica antes de utilizar o agente interno.",
      confirmationExpired: "A confirmação expirou. Peça ao agente para preparar novamente a ação.",
      confirmationCancelled: "Esta confirmação já foi cancelada.",
      confirmationConfirmed: "Esta confirmação já foi executada.",
    },
    mock: {
      operationFailed: "Não foi possível concluir a operação pedida.",
      noOpenActions: "Não encontrei ações abertas nesta fábrica.",
      openActionsFound: "Encontrei {count} ação(ões) aberta(s) nesta fábrica:",
      dueDate: "prazo {date}",
      noCommunications: "Não encontrei comunicações nesta fábrica.",
      communicationsFound: "Encontrei {count} comunicação(ões) nesta fábrica:",
      noDescription: "sem descrição",
      kpisFound: "KPIs obtidos para esta fábrica:",
      noOverdueActions: "Não encontrei ações em atraso nesta fábrica.",
      overdueActionsFound: "Encontrei {count} ação(ões) em atraso nesta fábrica:",
      reportGenerated: "Relatório gerado{period}: {title}.",
      metadataAvailable: "metadados disponíveis",
      specifyActionPriority: "Indique a ação e a prioridade pretendida. Exemplo: atualize a ação ACT-1 para prioridade alta.",
      actionUpdated: "Ação atualizada: {reference} - {title} ({priority}).",
      specifyActionToClose: "Indique o UUID ou o número/código da ação desta fábrica para preparar o encerramento.",
      confirmationRequired: "Esta ação exige confirmação antes de ser executada.",
      closureComment: "Encerramento preparado pelo agente mock/desenvolvimento. É necessária confirmação explícita.",
      help: "O modo mock/desenvolvimento está ativo. Comandos suportados: listar ações abertas, ações em atraso, listar comunicações, KPIs, atualizar a prioridade de uma ação, gerar o relatório do mês atual e encerrar uma ação.",
    },
    closeActionSummary: "Encerrar a ação \"{title}\" ({id}) com o comentário: {comment}",
  },
  it: {
    locale: "it",
    languageName: "Italian",
    ui: {
      openChat: "Apri la chat dell'agente interno",
      title: "Agente interno",
      closeChat: "Chiudi chat",
      close: "Chiudi",
      welcome: "Come posso aiutarti in questo stabilimento?",
      contactError: "Impossibile contattare l'agente interno.",
      noResponse: "L'agente non ha restituito una risposta.",
      genericError: "Si è verificato un errore durante il contatto con l'agente.",
      confirmationError: "Impossibile elaborare la conferma.",
      confirmationExecuted: "Conferma completata.",
      confirmationExecutedWithSummary: "Confermato: {summary}",
      confirmationCancelled: "Conferma annullata.",
      confirmationCancelledWithSummary: "Annullato: {summary}",
      confirmationRequired: "Questa azione richiede una conferma.",
      completed: "Richiesta completata.",
      statusChanged: "{title} ora ha lo stato {status}.",
      processing: "Elaborazione...",
      pendingConfirmation: "Confermare l'azione in sospeso?",
      confirm: "Conferma",
      cancel: "Annulla",
      messageLabel: "Messaggio",
      placeholder: "Scrivi un messaggio...",
      send: "Invia messaggio",
      truncated: "Risposta abbreviata per sicurezza. Riformula la richiesta per ottenere una risposta più breve.",
    },
    errors: {
      unavailable: "L'agente interno è temporaneamente non disponibile. Riprova più tardi.",
      disabled: "L'agente interno non è disponibile in questo ambiente.",
      forbidden: "Non hai l'autorizzazione per usare l'agente interno in questo stabilimento.",
      invalidRequest: "La richiesta inviata all'agente non è valida.",
      rateLimited: "Troppe richieste. Riprova tra alcuni secondi.",
      timeout: "L'agente ha impiegato troppo tempo a rispondere. Riprova.",
      authenticationRequired: "È necessario autenticarsi per utilizzare l'agente interno.",
      plantRequired: "Seleziona uno stabilimento prima di utilizzare l'agente interno.",
      confirmationExpired: "La conferma è scaduta. Chiedi all'agente di preparare nuovamente l'azione.",
      confirmationCancelled: "Questa conferma è già stata annullata.",
      confirmationConfirmed: "Questa conferma è già stata completata.",
    },
    mock: {
      operationFailed: "Impossibile completare l'operazione richiesta.",
      noOpenActions: "Non ho trovato azioni aperte in questo stabilimento.",
      openActionsFound: "Ho trovato {count} azione/i aperta/e in questo stabilimento:",
      dueDate: "scadenza {date}",
      noCommunications: "Non ho trovato comunicazioni in questo stabilimento.",
      communicationsFound: "Ho trovato {count} comunicazione/i in questo stabilimento:",
      noDescription: "senza descrizione",
      kpisFound: "KPI recuperati per questo stabilimento:",
      noOverdueActions: "Non ho trovato azioni scadute in questo stabilimento.",
      overdueActionsFound: "Ho trovato {count} azione/i scaduta/e in questo stabilimento:",
      reportGenerated: "Report generato{period}: {title}.",
      metadataAvailable: "metadati disponibili",
      specifyActionPriority: "Indica l'azione e la priorità desiderata. Esempio: aggiorna l'azione ACT-1 con priorità alta.",
      actionUpdated: "Azione aggiornata: {reference} - {title} ({priority}).",
      specifyActionToClose: "Indica l'UUID o il numero/codice dell'azione per prepararne la chiusura.",
      confirmationRequired: "Questa azione richiede una conferma prima dell'esecuzione.",
      closureComment: "Chiusura preparata dall'agente mock/sviluppo. È necessaria una conferma esplicita.",
      help: "La modalità mock/sviluppo è attiva. Comandi supportati: elencare azioni aperte, azioni scadute, comunicazioni, KPI, aggiornare la priorità, generare il report mensile e chiudere un'azione.",
    },
    closeActionSummary: "Chiudi l'azione \"{title}\" ({id}) con il commento: {comment}",
  },
  pl: {
    locale: "pl",
    languageName: "Polish",
    ui: {
      openChat: "Otwórz czat z agentem wewnętrznym",
      title: "Agent wewnętrzny",
      closeChat: "Zamknij czat",
      close: "Zamknij",
      welcome: "Jak mogę pomóc w tym zakładzie?",
      contactError: "Nie udało się skontaktować z agentem wewnętrznym.",
      noResponse: "Agent nie zwrócił odpowiedzi.",
      genericError: "Wystąpił błąd podczas kontaktu z agentem.",
      confirmationError: "Nie udało się przetworzyć potwierdzenia.",
      confirmationExecuted: "Potwierdzenie wykonane.",
      confirmationExecutedWithSummary: "Potwierdzono: {summary}",
      confirmationCancelled: "Potwierdzenie anulowane.",
      confirmationCancelledWithSummary: "Anulowano: {summary}",
      confirmationRequired: "Ta operacja wymaga potwierdzenia.",
      completed: "Żądanie zrealizowane.",
      statusChanged: "{title} ma teraz status {status}.",
      processing: "Przetwarzanie...",
      pendingConfirmation: "Potwierdzić oczekującą operację?",
      confirm: "Potwierdź",
      cancel: "Anuluj",
      messageLabel: "Wiadomość",
      placeholder: "Napisz wiadomość...",
      send: "Wyślij wiadomość",
      truncated: "Odpowiedź została skrócona ze względów bezpieczeństwa. Przeformułuj żądanie, aby uzyskać krótszą odpowiedź.",
    },
    errors: {
      unavailable: "Agent wewnętrzny jest tymczasowo niedostępny. Spróbuj ponownie później.",
      disabled: "Agent wewnętrzny nie jest dostępny w tym środowisku.",
      forbidden: "Nie masz uprawnień do korzystania z agenta wewnętrznego w tym zakładzie.",
      invalidRequest: "Żądanie wysłane do agenta jest nieprawidłowe.",
      rateLimited: "Zbyt wiele żądań. Spróbuj ponownie za kilka sekund.",
      timeout: "Agent odpowiadał zbyt długo. Spróbuj ponownie.",
      authenticationRequired: "Korzystanie z agenta wewnętrznego wymaga uwierzytelnienia.",
      plantRequired: "Przed użyciem agenta wewnętrznego wybierz zakład.",
      confirmationExpired: "Potwierdzenie wygasło. Poproś agenta o ponowne przygotowanie operacji.",
      confirmationCancelled: "To potwierdzenie zostało już anulowane.",
      confirmationConfirmed: "To potwierdzenie zostało już wykonane.",
    },
    mock: {
      operationFailed: "Nie udało się wykonać żądanej operacji.",
      noOpenActions: "Nie znaleziono otwartych działań w tym zakładzie.",
      openActionsFound: "Znaleziono {count} otwartych działań w tym zakładzie:",
      dueDate: "termin {date}",
      noCommunications: "Nie znaleziono zgłoszeń w tym zakładzie.",
      communicationsFound: "Znaleziono {count} zgłoszeń w tym zakładzie:",
      noDescription: "brak opisu",
      kpisFound: "Pobrano KPI dla tego zakładu:",
      noOverdueActions: "Nie znaleziono zaległych działań w tym zakładzie.",
      overdueActionsFound: "Znaleziono {count} zaległych działań w tym zakładzie:",
      reportGenerated: "Wygenerowano raport{period}: {title}.",
      metadataAvailable: "metadane dostępne",
      specifyActionPriority: "Podaj działanie i priorytet. Przykład: ustaw wysoki priorytet dla działania ACT-1.",
      actionUpdated: "Zaktualizowano działanie: {reference} - {title} ({priority}).",
      specifyActionToClose: "Podaj UUID lub numer/kod działania, aby przygotować jego zamknięcie.",
      confirmationRequired: "Ta operacja wymaga potwierdzenia przed wykonaniem.",
      closureComment: "Zamknięcie przygotowane przez agenta mock/deweloperskiego. Wymagane jest wyraźne potwierdzenie.",
      help: "Tryb mock/deweloperski jest aktywny. Obsługiwane polecenia: lista otwartych i zaległych działań, zgłoszenia, KPI, zmiana priorytetu, raport miesięczny i zamknięcie działania.",
    },
    closeActionSummary: "Zamknij działanie \"{title}\" ({id}) z komentarzem: {comment}",
  },
  de: {
    locale: "de",
    languageName: "German",
    ui: {
      openChat: "Chat mit dem internen Agenten öffnen",
      title: "Interner Agent",
      closeChat: "Chat schließen",
      close: "Schließen",
      welcome: "Wie kann ich an diesem Standort helfen?",
      contactError: "Der interne Agent konnte nicht erreicht werden.",
      noResponse: "Der Agent hat keine Antwort zurückgegeben.",
      genericError: "Beim Kontakt mit dem Agenten ist ein Fehler aufgetreten.",
      confirmationError: "Die Bestätigung konnte nicht verarbeitet werden.",
      confirmationExecuted: "Bestätigung abgeschlossen.",
      confirmationExecutedWithSummary: "Bestätigt: {summary}",
      confirmationCancelled: "Bestätigung abgebrochen.",
      confirmationCancelledWithSummary: "Abgebrochen: {summary}",
      confirmationRequired: "Diese Aktion erfordert eine Bestätigung.",
      completed: "Anfrage abgeschlossen.",
      statusChanged: "{title} hat jetzt den Status {status}.",
      processing: "Verarbeitung...",
      pendingConfirmation: "Ausstehende Aktion bestätigen?",
      confirm: "Bestätigen",
      cancel: "Abbrechen",
      messageLabel: "Nachricht",
      placeholder: "Nachricht schreiben...",
      send: "Nachricht senden",
      truncated: "Die Antwort wurde aus Sicherheitsgründen gekürzt. Formulieren Sie die Anfrage für eine kürzere Antwort neu.",
    },
    errors: {
      unavailable: "Der interne Agent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.",
      disabled: "Der interne Agent ist in dieser Umgebung nicht verfügbar.",
      forbidden: "Sie sind nicht berechtigt, den internen Agenten an diesem Standort zu verwenden.",
      invalidRequest: "Die an den Agenten gesendete Anfrage ist ungültig.",
      rateLimited: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Sekunden erneut.",
      timeout: "Der Agent hat zu lange für die Antwort benötigt. Bitte versuchen Sie es erneut.",
      authenticationRequired: "Für den internen Agenten ist eine Anmeldung erforderlich.",
      plantRequired: "Wählen Sie einen Standort, bevor Sie den internen Agenten verwenden.",
      confirmationExpired: "Die Bestätigung ist abgelaufen. Bitten Sie den Agenten, die Aktion erneut vorzubereiten.",
      confirmationCancelled: "Diese Bestätigung wurde bereits abgebrochen.",
      confirmationConfirmed: "Diese Bestätigung wurde bereits ausgeführt.",
    },
    mock: {
      operationFailed: "Die angeforderte Aktion konnte nicht abgeschlossen werden.",
      noOpenActions: "An diesem Standort wurden keine offenen Maßnahmen gefunden.",
      openActionsFound: "An diesem Standort wurden {count} offene Maßnahme(n) gefunden:",
      dueDate: "fällig am {date}",
      noCommunications: "An diesem Standort wurden keine Meldungen gefunden.",
      communicationsFound: "An diesem Standort wurden {count} Meldung(en) gefunden:",
      noDescription: "keine Beschreibung",
      kpisFound: "KPIs für diesen Standort abgerufen:",
      noOverdueActions: "An diesem Standort wurden keine überfälligen Maßnahmen gefunden.",
      overdueActionsFound: "An diesem Standort wurden {count} überfällige Maßnahme(n) gefunden:",
      reportGenerated: "Bericht erstellt{period}: {title}.",
      metadataAvailable: "Metadaten verfügbar",
      specifyActionPriority: "Geben Sie die Maßnahme und die gewünschte Priorität an, z. B. ACT-1 mit hoher Priorität aktualisieren.",
      actionUpdated: "Maßnahme aktualisiert: {reference} - {title} ({priority}).",
      specifyActionToClose: "Geben Sie die UUID oder Nummer/den Code der Maßnahme an, um den Abschluss vorzubereiten.",
      confirmationRequired: "Diese Aktion muss vor der Ausführung bestätigt werden.",
      closureComment: "Abschluss durch den Mock-/Entwicklungsagenten vorbereitet. Eine ausdrückliche Bestätigung ist erforderlich.",
      help: "Der Mock-/Entwicklungsmodus ist aktiv. Unterstützt werden offene und überfällige Maßnahmen, Meldungen, KPIs, Prioritätsänderungen, Monatsberichte und das Schließen einer Maßnahme.",
    },
    closeActionSummary: "Maßnahme \"{title}\" ({id}) mit folgendem Kommentar schließen: {comment}",
  },
  ro: {
    locale: "ro",
    languageName: "Romanian",
    ui: {
      openChat: "Deschideți chatul agentului intern",
      title: "Agent intern",
      closeChat: "Închideți chatul",
      close: "Închideți",
      welcome: "Cum vă pot ajuta în această fabrică?",
      contactError: "Agentul intern nu a putut fi contactat.",
      noResponse: "Agentul nu a returnat niciun răspuns.",
      genericError: "A apărut o eroare la contactarea agentului.",
      confirmationError: "Confirmarea nu a putut fi procesată.",
      confirmationExecuted: "Confirmare finalizată.",
      confirmationExecutedWithSummary: "Confirmat: {summary}",
      confirmationCancelled: "Confirmare anulată.",
      confirmationCancelledWithSummary: "Anulat: {summary}",
      confirmationRequired: "Această acțiune necesită confirmare.",
      completed: "Solicitare finalizată.",
      statusChanged: "{title} are acum starea {status}.",
      processing: "Se procesează...",
      pendingConfirmation: "Confirmați acțiunea în așteptare?",
      confirm: "Confirmați",
      cancel: "Anulați",
      messageLabel: "Mesaj",
      placeholder: "Scrieți un mesaj...",
      send: "Trimiteți mesajul",
      truncated: "Răspunsul a fost scurtat din motive de siguranță. Reformulați solicitarea pentru un răspuns mai scurt.",
    },
    errors: {
      unavailable: "Agentul intern este temporar indisponibil. Încercați din nou mai târziu.",
      disabled: "Agentul intern nu este disponibil în acest mediu.",
      forbidden: "Nu aveți permisiunea de a utiliza agentul intern în această fabrică.",
      invalidRequest: "Solicitarea trimisă agentului nu este validă.",
      rateLimited: "Prea multe solicitări. Încercați din nou peste câteva secunde.",
      timeout: "Agentul a răspuns prea lent. Încercați din nou.",
      authenticationRequired: "Este necesară autentificarea pentru a utiliza agentul intern.",
      plantRequired: "Selectați o fabrică înainte de a utiliza agentul intern.",
      confirmationExpired: "Confirmarea a expirat. Solicitați agentului să pregătească din nou acțiunea.",
      confirmationCancelled: "Această confirmare a fost deja anulată.",
      confirmationConfirmed: "Această confirmare a fost deja executată.",
    },
    mock: {
      operationFailed: "Operațiunea solicitată nu a putut fi finalizată.",
      noOpenActions: "Nu am găsit acțiuni deschise în această fabrică.",
      openActionsFound: "Am găsit {count} acțiuni deschise în această fabrică:",
      dueDate: "termen {date}",
      noCommunications: "Nu am găsit comunicări în această fabrică.",
      communicationsFound: "Am găsit {count} comunicări în această fabrică:",
      noDescription: "fără descriere",
      kpisFound: "KPI obținuți pentru această fabrică:",
      noOverdueActions: "Nu am găsit acțiuni întârziate în această fabrică.",
      overdueActionsFound: "Am găsit {count} acțiuni întârziate în această fabrică:",
      reportGenerated: "Raport generat{period}: {title}.",
      metadataAvailable: "metadate disponibile",
      specifyActionPriority: "Indicați acțiunea și prioritatea dorită. Exemplu: actualizați acțiunea ACT-1 cu prioritate ridicată.",
      actionUpdated: "Acțiune actualizată: {reference} - {title} ({priority}).",
      specifyActionToClose: "Indicați UUID-ul sau numărul/codul acțiunii pentru a pregăti închiderea.",
      confirmationRequired: "Această acțiune necesită confirmare înainte de executare.",
      closureComment: "Închidere pregătită de agentul mock/dezvoltare. Este necesară confirmarea explicită.",
      help: "Modul mock/dezvoltare este activ. Sunt acceptate acțiuni deschise și întârziate, comunicări, KPI, modificarea priorității, raportul lunar și închiderea unei acțiuni.",
    },
    closeActionSummary: "Închideți acțiunea \"{title}\" ({id}) cu comentariul: {comment}",
  },
  fr: {
    locale: "fr",
    languageName: "French",
    ui: {
      openChat: "Ouvrir le chat de l'agent interne",
      title: "Agent interne",
      closeChat: "Fermer le chat",
      close: "Fermer",
      welcome: "Comment puis-je vous aider dans cette usine ?",
      contactError: "Impossible de contacter l'agent interne.",
      noResponse: "L'agent n'a renvoyé aucune réponse.",
      genericError: "Une erreur s'est produite lors du contact avec l'agent.",
      confirmationError: "La confirmation n'a pas pu être traitée.",
      confirmationExecuted: "Confirmation effectuée.",
      confirmationExecutedWithSummary: "Confirmé : {summary}",
      confirmationCancelled: "Confirmation annulée.",
      confirmationCancelledWithSummary: "Annulé : {summary}",
      confirmationRequired: "Cette action nécessite une confirmation.",
      completed: "Demande terminée.",
      statusChanged: "{title} a maintenant le statut {status}.",
      processing: "Traitement...",
      pendingConfirmation: "Confirmer l'action en attente ?",
      confirm: "Confirmer",
      cancel: "Annuler",
      messageLabel: "Message",
      placeholder: "Écrivez un message...",
      send: "Envoyer le message",
      truncated: "La réponse a été raccourcie pour des raisons de sécurité. Reformulez la demande pour obtenir une réponse plus courte.",
    },
    errors: {
      unavailable: "L'agent interne est temporairement indisponible. Veuillez réessayer plus tard.",
      disabled: "L'agent interne n'est pas disponible dans cet environnement.",
      forbidden: "Vous n'êtes pas autorisé à utiliser l'agent interne dans cette usine.",
      invalidRequest: "La demande envoyée à l'agent n'est pas valide.",
      rateLimited: "Trop de demandes. Veuillez réessayer dans quelques secondes.",
      timeout: "L'agent a mis trop de temps à répondre. Veuillez réessayer.",
      authenticationRequired: "Une authentification est nécessaire pour utiliser l'agent interne.",
      plantRequired: "Sélectionnez une usine avant d'utiliser l'agent interne.",
      confirmationExpired: "La confirmation a expiré. Demandez à l'agent de préparer à nouveau l'action.",
      confirmationCancelled: "Cette confirmation a déjà été annulée.",
      confirmationConfirmed: "Cette confirmation a déjà été exécutée.",
    },
    mock: {
      operationFailed: "L'opération demandée n'a pas pu être effectuée.",
      noOpenActions: "Aucune action ouverte n'a été trouvée dans cette usine.",
      openActionsFound: "{count} action(s) ouverte(s) ont été trouvées dans cette usine :",
      dueDate: "échéance {date}",
      noCommunications: "Aucune communication n'a été trouvée dans cette usine.",
      communicationsFound: "{count} communication(s) ont été trouvées dans cette usine :",
      noDescription: "sans description",
      kpisFound: "KPI obtenus pour cette usine :",
      noOverdueActions: "Aucune action en retard n'a été trouvée dans cette usine.",
      overdueActionsFound: "{count} action(s) en retard ont été trouvées dans cette usine :",
      reportGenerated: "Rapport généré{period} : {title}.",
      metadataAvailable: "métadonnées disponibles",
      specifyActionPriority: "Indiquez l'action et la priorité souhaitée. Exemple : attribuez une priorité élevée à l'action ACT-1.",
      actionUpdated: "Action mise à jour : {reference} - {title} ({priority}).",
      specifyActionToClose: "Indiquez l'UUID ou le numéro/code de l'action afin de préparer sa clôture.",
      confirmationRequired: "Cette action nécessite une confirmation avant son exécution.",
      closureComment: "Clôture préparée par l'agent mock/développement. Une confirmation explicite est requise.",
      help: "Le mode mock/développement est actif. Commandes prises en charge : actions ouvertes et en retard, communications, KPI, modification de priorité, rapport mensuel et clôture d'une action.",
    },
    closeActionSummary: "Clôturer l'action \"{title}\" ({id}) avec le commentaire : {comment}",
  },
};

export function normalizeInternalAgentLocale(locale: string | null | undefined): AppLocale {
  const normalized = locale?.trim().toLowerCase().split("-")[0];
  return locales.includes(normalized as AppLocale) ? (normalized as AppLocale) : "en";
}

export function getInternalAgentCopy(locale: string | null | undefined) {
  return COPY[normalizeInternalAgentLocale(locale)];
}

export function formatInternalAgentCopy(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function getInternalAgentLanguageInstructions(locale: string | null | undefined) {
  const copy = getInternalAgentCopy(locale);
  return [
    `The authenticated user's preferred language is ${copy.languageName} (${copy.locale}).`,
    `Always write every user-facing response in ${copy.languageName}. This includes questions, confirmations, explanations, errors, warnings and summaries.`,
    `Translate human-readable text returned by tools into ${copy.languageName}, while preserving record identifiers, codes, enum values, dates and proper names.`,
    "Do not infer the response language from the user's message or use a default language. Use another language only when the user explicitly requests it in the current message.",
  ].join("\n");
}

export function getInternalAgentErrorMessage(locale: string | null | undefined, errorCode?: string) {
  const errors = getInternalAgentCopy(locale).errors;
  switch (errorCode) {
    case "AGENT_DISABLED":
      return errors.disabled;
    case "AGENT_FORBIDDEN":
    case "FORBIDDEN":
      return errors.forbidden;
    case "INVALID_AGENT_REQUEST":
      return errors.invalidRequest;
    case "AGENT_RATE_LIMITED":
    case "AGENT_MAX_TOOL_CALLS_EXCEEDED":
    case "OPENAI_QUOTA_OR_RATE_LIMIT":
      return errors.rateLimited;
    case "AGENT_TIMEOUT":
      return errors.timeout;
    case "UNAUTHORIZED":
      return errors.authenticationRequired;
    case "PLANT_REQUIRED":
      return errors.plantRequired;
    case "CONFIRMATION_EXPIRED":
      return errors.confirmationExpired;
    case "CONFIRMATION_CANCELLED":
      return errors.confirmationCancelled;
    case "CONFIRMATION_CONFIRMED":
      return errors.confirmationConfirmed;
    default:
      return errors.unavailable;
  }
}
