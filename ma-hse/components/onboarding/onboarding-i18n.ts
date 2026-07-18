import type { AppLocale } from "@/lib/i18n/routing";
import { getUiDictionary, normalizeUiLocale, type UiDictionary } from "@/lib/ui-language";

export type OnboardingWelcomeCopy = {
  title: string;
  description: string;
  start: string;
  dismiss: string;
  preparing: string;
};

export type OnboardingTourCopy = {
  previous: string;
  next: string;
  finish: string;
  exit: string;
  dialogLabel: string;
  progress: string;
};

type StepCopy = {
  title: string;
  description: string;
};

type SpecialStepId =
  | "topbar"
  | "dashboard-overview"
  | "sidebar"
  | "notifications"
  | "ai-assistant"
  | "user-menu"
  | "corporate-overview"
  | "corporate-comparison"
  | "corporate-actions"
  | "corporate-reports"
  | "system-settings"
  | "settings-plants"
  | "settings-modules"
  | "settings-users"
  | "agent-audit";

type OnboardingLocaleCopy = {
  welcome: OnboardingWelcomeCopy;
  tour: OnboardingTourCopy;
  menu: {
    restart: string;
    restarting: string;
  };
  requestError: string;
  moduleDescription: string;
  steps: Record<SpecialStepId, StepCopy>;
};

const COPY: Record<AppLocale, OnboardingLocaleCopy> = {
  en: {
    welcome: {
      title: "Welcome to MA HSE",
      description: "We will introduce the main features available for your profile.",
      start: "Start guided tour",
      dismiss: "Explore later",
      preparing: "Preparing tour...",
    },
    tour: {
      previous: "Previous",
      next: "Next",
      finish: "Finish",
      exit: "Exit guided tour",
      dialogLabel: "Guided tour: {title}",
      progress: "Step {current} of {total}",
    },
    menu: { restart: "Restart guided tour", restarting: "Restarting tour..." },
    requestError: "The guided tour could not be updated. Please try again.",
    moduleDescription: "Open {module} to use the features available for your profile at this plant.",
    steps: {
      topbar: { title: "Quick access", description: "Find alerts, theme controls and account options here." },
      "dashboard-overview": { title: "Plant dashboard", description: "Review the main safety indicators and track plant performance." },
      sidebar: { title: "Side menu", description: "Use this menu to open the modules available for your profile and this plant." },
      notifications: { title: "Notifications", description: "Review alerts related to your responsibilities and mark them as read." },
      "ai-assistant": { title: "AI assistant", description: "Ask for help finding information and performing permitted operations within your access level." },
      "user-menu": { title: "Account and help", description: "Change your settings or restart this guided tour whenever you need it." },
      "corporate-overview": { title: "Corporate dashboard", description: "Track global indicators and compare plant performance." },
      "corporate-comparison": { title: "Plant comparison", description: "Explore indicators, trends and rankings across the different sites." },
      "corporate-actions": { title: "Corporate actions", description: "Track open and overdue actions across all plants." },
      "corporate-reports": { title: "Corporate reports", description: "Review the history of global and plant reports." },
      "system-settings": { title: "Global settings", description: "Manage MA HSE global settings and select the plant to configure." },
      "settings-plants": { title: "Plant management", description: "Create and maintain plants and their assigned managers." },
      "settings-modules": { title: "Modules and settings", description: "Enable modules globally or adjust their availability by plant." },
      "settings-users": { title: "User management", description: "Create and manage users while respecting the existing access levels." },
      "agent-audit": { title: "AI assistant audit", description: "Review usage records for the AI assistant and its tools." },
    },
  },
  pt: {
    welcome: {
      title: "Bem-vindo ao MA HSE",
      description: "Vamos apresentar-lhe as principais funcionalidades disponíveis para o seu perfil.",
      start: "Iniciar visita guiada",
      dismiss: "Explorar mais tarde",
      preparing: "A preparar visita...",
    },
    tour: {
      previous: "Anterior",
      next: "Seguinte",
      finish: "Terminar",
      exit: "Sair da visita guiada",
      dialogLabel: "Visita guiada: {title}",
      progress: "Passo {current} de {total}",
    },
    menu: { restart: "Reiniciar visita guiada", restarting: "A reiniciar visita..." },
    requestError: "Não foi possível atualizar a visita guiada. Tente novamente.",
    moduleDescription: "Aceda a {module} para utilizar as funcionalidades disponíveis para o seu perfil nesta fábrica.",
    steps: {
      topbar: { title: "Acesso rápido", description: "Aqui encontra os alertas, o tema e as opções da sua conta." },
      "dashboard-overview": { title: "Dashboard da fábrica", description: "Consulte os principais indicadores de segurança e acompanhe a evolução da fábrica." },
      sidebar: { title: "Menu lateral", description: "Use este menu para aceder aos módulos disponíveis para o seu perfil e para esta fábrica." },
      notifications: { title: "Notificações", description: "Consulte os alertas associados às suas responsabilidades e marque-os como lidos." },
      "ai-assistant": { title: "Assistente IA", description: "Peça apoio para consultar informação e executar operações permitidas, sempre dentro do seu nível de acesso." },
      "user-menu": { title: "Conta e ajuda", description: "Altere as suas definições ou reinicie esta visita guiada quando precisar." },
      "corporate-overview": { title: "Dashboard corporativo", description: "Acompanhe indicadores globais e compare o desempenho das fábricas." },
      "corporate-comparison": { title: "Comparação entre fábricas", description: "Explore indicadores, tendências e rankings entre as várias unidades." },
      "corporate-actions": { title: "Ações corporativas", description: "Acompanhe ações abertas e em atraso em todas as fábricas." },
      "corporate-reports": { title: "Relatórios corporativos", description: "Consulte o histórico de relatórios globais e por fábrica." },
      "system-settings": { title: "Configuração global", description: "Administre as definições globais do MA HSE e selecione a fábrica a configurar." },
      "settings-plants": { title: "Gestão de fábricas", description: "Crie e mantenha as fábricas e os respetivos responsáveis." },
      "settings-modules": { title: "Módulos e configurações", description: "Ative os módulos globalmente ou ajuste a disponibilidade por fábrica." },
      "settings-users": { title: "Gestão de utilizadores", description: "Crie e administre utilizadores respeitando os níveis de acesso existentes." },
      "agent-audit": { title: "Auditoria do agente", description: "Consulte os registos de utilização do assistente IA e das respetivas ferramentas." },
    },
  },
  it: {
    welcome: {
      title: "Benvenuto in MA HSE",
      description: "Ti presenteremo le principali funzionalità disponibili per il tuo profilo.",
      start: "Avvia visita guidata",
      dismiss: "Esplora più tardi",
      preparing: "Preparazione della visita...",
    },
    tour: {
      previous: "Precedente",
      next: "Avanti",
      finish: "Termina",
      exit: "Esci dalla visita guidata",
      dialogLabel: "Visita guidata: {title}",
      progress: "Passaggio {current} di {total}",
    },
    menu: { restart: "Riavvia visita guidata", restarting: "Riavvio della visita..." },
    requestError: "Impossibile aggiornare la visita guidata. Riprova.",
    moduleDescription: "Apri {module} per utilizzare le funzionalità disponibili per il tuo profilo in questo stabilimento.",
    steps: {
      topbar: { title: "Accesso rapido", description: "Qui trovi gli avvisi, il tema e le opzioni del tuo account." },
      "dashboard-overview": { title: "Dashboard dello stabilimento", description: "Consulta i principali indicatori di sicurezza e segui l'andamento dello stabilimento." },
      sidebar: { title: "Menu laterale", description: "Usa questo menu per aprire i moduli disponibili per il tuo profilo e questo stabilimento." },
      notifications: { title: "Notifiche", description: "Consulta gli avvisi legati alle tue responsabilità e contrassegnali come letti." },
      "ai-assistant": { title: "Assistente IA", description: "Chiedi aiuto per trovare informazioni ed eseguire operazioni consentite dal tuo livello di accesso." },
      "user-menu": { title: "Account e assistenza", description: "Modifica le impostazioni o riavvia questa visita guidata quando necessario." },
      "corporate-overview": { title: "Dashboard aziendale", description: "Monitora gli indicatori globali e confronta le prestazioni degli stabilimenti." },
      "corporate-comparison": { title: "Confronto tra stabilimenti", description: "Esplora indicatori, tendenze e classifiche tra i diversi siti." },
      "corporate-actions": { title: "Azioni aziendali", description: "Monitora le azioni aperte e scadute in tutti gli stabilimenti." },
      "corporate-reports": { title: "Report aziendali", description: "Consulta lo storico dei report globali e dei singoli stabilimenti." },
      "system-settings": { title: "Impostazioni globali", description: "Gestisci le impostazioni globali di MA HSE e seleziona lo stabilimento da configurare." },
      "settings-plants": { title: "Gestione stabilimenti", description: "Crea e gestisci gli stabilimenti e i relativi responsabili." },
      "settings-modules": { title: "Moduli e impostazioni", description: "Abilita i moduli globalmente o regolane la disponibilità per stabilimento." },
      "settings-users": { title: "Gestione utenti", description: "Crea e gestisci gli utenti rispettando i livelli di accesso esistenti." },
      "agent-audit": { title: "Audit dell'assistente IA", description: "Consulta i registri di utilizzo dell'assistente IA e dei relativi strumenti." },
    },
  },
  pl: {
    welcome: {
      title: "Witamy w MA HSE",
      description: "Przedstawimy najważniejsze funkcje dostępne dla Twojego profilu.",
      start: "Rozpocznij przewodnik",
      dismiss: "Przeglądaj później",
      preparing: "Przygotowywanie przewodnika...",
    },
    tour: {
      previous: "Wstecz",
      next: "Dalej",
      finish: "Zakończ",
      exit: "Opuść przewodnik",
      dialogLabel: "Przewodnik: {title}",
      progress: "Krok {current} z {total}",
    },
    menu: { restart: "Uruchom przewodnik ponownie", restarting: "Ponowne uruchamianie przewodnika..." },
    requestError: "Nie udało się zaktualizować przewodnika. Spróbuj ponownie.",
    moduleDescription: "Otwórz moduł {module}, aby korzystać z funkcji dostępnych dla Twojego profilu w tym zakładzie.",
    steps: {
      topbar: { title: "Szybki dostęp", description: "Tutaj znajdziesz alerty, ustawienia motywu i opcje konta." },
      "dashboard-overview": { title: "Panel zakładu", description: "Sprawdzaj główne wskaźniki bezpieczeństwa i śledź wyniki zakładu." },
      sidebar: { title: "Menu boczne", description: "Użyj tego menu, aby otworzyć moduły dostępne dla Twojego profilu i tego zakładu." },
      notifications: { title: "Powiadomienia", description: "Przeglądaj alerty związane z Twoimi obowiązkami i oznaczaj je jako przeczytane." },
      "ai-assistant": { title: "Asystent AI", description: "Poproś o pomoc w wyszukiwaniu informacji i wykonywaniu operacji dozwolonych dla Twojego poziomu dostępu." },
      "user-menu": { title: "Konto i pomoc", description: "Zmień ustawienia lub uruchom ponownie ten przewodnik, gdy będzie potrzebny." },
      "corporate-overview": { title: "Panel korporacyjny", description: "Śledź globalne wskaźniki i porównuj wyniki zakładów." },
      "corporate-comparison": { title: "Porównanie zakładów", description: "Analizuj wskaźniki, trendy i rankingi różnych lokalizacji." },
      "corporate-actions": { title: "Działania korporacyjne", description: "Śledź otwarte i zaległe działania we wszystkich zakładach." },
      "corporate-reports": { title: "Raporty korporacyjne", description: "Przeglądaj historię raportów globalnych i raportów zakładów." },
      "system-settings": { title: "Ustawienia globalne", description: "Zarządzaj globalnymi ustawieniami MA HSE i wybierz zakład do konfiguracji." },
      "settings-plants": { title: "Zarządzanie zakładami", description: "Twórz i utrzymuj zakłady oraz przypisanych do nich kierowników." },
      "settings-modules": { title: "Moduły i ustawienia", description: "Włączaj moduły globalnie lub dostosowuj ich dostępność dla poszczególnych zakładów." },
      "settings-users": { title: "Zarządzanie użytkownikami", description: "Twórz użytkowników i zarządzaj nimi zgodnie z istniejącymi poziomami dostępu." },
      "agent-audit": { title: "Audyt asystenta AI", description: "Przeglądaj rejestry użycia asystenta AI i jego narzędzi." },
    },
  },
  de: {
    welcome: {
      title: "Willkommen bei MA HSE",
      description: "Wir zeigen Ihnen die wichtigsten Funktionen, die für Ihr Profil verfügbar sind.",
      start: "Geführte Tour starten",
      dismiss: "Später erkunden",
      preparing: "Tour wird vorbereitet...",
    },
    tour: {
      previous: "Zurück",
      next: "Weiter",
      finish: "Beenden",
      exit: "Geführte Tour verlassen",
      dialogLabel: "Geführte Tour: {title}",
      progress: "Schritt {current} von {total}",
    },
    menu: { restart: "Geführte Tour neu starten", restarting: "Tour wird neu gestartet..." },
    requestError: "Die geführte Tour konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
    moduleDescription: "Öffnen Sie {module}, um die für Ihr Profil an diesem Standort verfügbaren Funktionen zu nutzen.",
    steps: {
      topbar: { title: "Schnellzugriff", description: "Hier finden Sie Warnmeldungen, die Designauswahl und Ihre Kontooptionen." },
      "dashboard-overview": { title: "Standort-Dashboard", description: "Prüfen Sie die wichtigsten Sicherheitskennzahlen und verfolgen Sie die Standortentwicklung." },
      sidebar: { title: "Seitenmenü", description: "Über dieses Menü öffnen Sie die für Ihr Profil und diesen Standort verfügbaren Module." },
      notifications: { title: "Benachrichtigungen", description: "Prüfen Sie Meldungen zu Ihren Verantwortlichkeiten und markieren Sie sie als gelesen." },
      "ai-assistant": { title: "KI-Assistent", description: "Lassen Sie sich beim Finden von Informationen und bei erlaubten Vorgängen innerhalb Ihrer Zugriffsstufe unterstützen." },
      "user-menu": { title: "Konto und Hilfe", description: "Ändern Sie Ihre Einstellungen oder starten Sie diese Tour bei Bedarf erneut." },
      "corporate-overview": { title: "Unternehmensdashboard", description: "Verfolgen Sie globale Kennzahlen und vergleichen Sie die Standortleistung." },
      "corporate-comparison": { title: "Standortvergleich", description: "Analysieren Sie Kennzahlen, Trends und Ranglisten der verschiedenen Standorte." },
      "corporate-actions": { title: "Unternehmensmaßnahmen", description: "Verfolgen Sie offene und überfällige Maßnahmen an allen Standorten." },
      "corporate-reports": { title: "Unternehmensberichte", description: "Prüfen Sie den Verlauf globaler und standortbezogener Berichte." },
      "system-settings": { title: "Globale Einstellungen", description: "Verwalten Sie die globalen MA-HSE-Einstellungen und wählen Sie den zu konfigurierenden Standort." },
      "settings-plants": { title: "Standortverwaltung", description: "Erstellen und verwalten Sie Standorte sowie die zugewiesenen Verantwortlichen." },
      "settings-modules": { title: "Module und Einstellungen", description: "Aktivieren Sie Module global oder passen Sie deren Verfügbarkeit je Standort an." },
      "settings-users": { title: "Benutzerverwaltung", description: "Erstellen und verwalten Sie Benutzer unter Beachtung der bestehenden Zugriffsstufen." },
      "agent-audit": { title: "Prüfung des KI-Assistenten", description: "Prüfen Sie die Nutzungsprotokolle des KI-Assistenten und seiner Werkzeuge." },
    },
  },
  ro: {
    welcome: {
      title: "Bun venit la MA HSE",
      description: "Vă vom prezenta principalele funcționalități disponibile pentru profilul dvs.",
      start: "Începeți turul ghidat",
      dismiss: "Explorați mai târziu",
      preparing: "Se pregătește turul...",
    },
    tour: {
      previous: "Înapoi",
      next: "Următorul",
      finish: "Finalizare",
      exit: "Ieșiți din turul ghidat",
      dialogLabel: "Tur ghidat: {title}",
      progress: "Pasul {current} din {total}",
    },
    menu: { restart: "Reporniți turul ghidat", restarting: "Se repornește turul..." },
    requestError: "Turul ghidat nu a putut fi actualizat. Încercați din nou.",
    moduleDescription: "Deschideți {module} pentru a utiliza funcțiile disponibile profilului dvs. în această fabrică.",
    steps: {
      topbar: { title: "Acces rapid", description: "Aici găsiți alertele, tema și opțiunile contului dvs." },
      "dashboard-overview": { title: "Panoul fabricii", description: "Consultați principalii indicatori de siguranță și urmăriți evoluția fabricii." },
      sidebar: { title: "Meniu lateral", description: "Utilizați acest meniu pentru a deschide modulele disponibile profilului dvs. și acestei fabrici." },
      notifications: { title: "Notificări", description: "Consultați alertele asociate responsabilităților dvs. și marcați-le drept citite." },
      "ai-assistant": { title: "Asistent IA", description: "Solicitați ajutor pentru găsirea informațiilor și efectuarea operațiunilor permise nivelului dvs. de acces." },
      "user-menu": { title: "Cont și ajutor", description: "Modificați setările sau reporniți acest tur ghidat ori de câte ori este necesar." },
      "corporate-overview": { title: "Panou corporativ", description: "Urmăriți indicatorii globali și comparați performanța fabricilor." },
      "corporate-comparison": { title: "Comparație între fabrici", description: "Explorați indicatorii, tendințele și clasamentele diferitelor unități." },
      "corporate-actions": { title: "Acțiuni corporative", description: "Urmăriți acțiunile deschise și întârziate din toate fabricile." },
      "corporate-reports": { title: "Rapoarte corporative", description: "Consultați istoricul rapoartelor globale și al rapoartelor pe fabrică." },
      "system-settings": { title: "Configurare globală", description: "Administrați setările globale MA HSE și selectați fabrica de configurat." },
      "settings-plants": { title: "Gestionarea fabricilor", description: "Creați și administrați fabricile și responsabilii atribuiți." },
      "settings-modules": { title: "Module și setări", description: "Activați modulele global sau ajustați disponibilitatea lor pentru fiecare fabrică." },
      "settings-users": { title: "Gestionarea utilizatorilor", description: "Creați și administrați utilizatorii respectând nivelurile de acces existente." },
      "agent-audit": { title: "Auditul asistentului IA", description: "Consultați înregistrările de utilizare ale asistentului IA și ale instrumentelor sale." },
    },
  },
  fr: {
    welcome: {
      title: "Bienvenue dans MA HSE",
      description: "Nous allons vous présenter les principales fonctionnalités disponibles pour votre profil.",
      start: "Démarrer la visite guidée",
      dismiss: "Explorer plus tard",
      preparing: "Préparation de la visite...",
    },
    tour: {
      previous: "Précédent",
      next: "Suivant",
      finish: "Terminer",
      exit: "Quitter la visite guidée",
      dialogLabel: "Visite guidée : {title}",
      progress: "Étape {current} sur {total}",
    },
    menu: { restart: "Redémarrer la visite guidée", restarting: "Redémarrage de la visite..." },
    requestError: "La visite guidée n'a pas pu être mise à jour. Veuillez réessayer.",
    moduleDescription: "Ouvrez {module} pour utiliser les fonctionnalités disponibles pour votre profil dans cette usine.",
    steps: {
      topbar: { title: "Accès rapide", description: "Vous trouverez ici les alertes, le thème et les options de votre compte." },
      "dashboard-overview": { title: "Tableau de bord de l'usine", description: "Consultez les principaux indicateurs de sécurité et suivez l'évolution de l'usine." },
      sidebar: { title: "Menu latéral", description: "Utilisez ce menu pour ouvrir les modules disponibles pour votre profil et cette usine." },
      notifications: { title: "Notifications", description: "Consultez les alertes liées à vos responsabilités et marquez-les comme lues." },
      "ai-assistant": { title: "Assistant IA", description: "Demandez de l'aide pour trouver des informations et effectuer les opérations autorisées par votre niveau d'accès." },
      "user-menu": { title: "Compte et aide", description: "Modifiez vos paramètres ou redémarrez cette visite guidée lorsque nécessaire." },
      "corporate-overview": { title: "Tableau de bord corporate", description: "Suivez les indicateurs globaux et comparez les performances des usines." },
      "corporate-comparison": { title: "Comparaison des usines", description: "Explorez les indicateurs, les tendances et les classements des différents sites." },
      "corporate-actions": { title: "Actions corporate", description: "Suivez les actions ouvertes et en retard dans toutes les usines." },
      "corporate-reports": { title: "Rapports corporate", description: "Consultez l'historique des rapports globaux et par usine." },
      "system-settings": { title: "Configuration globale", description: "Gérez les paramètres globaux de MA HSE et sélectionnez l'usine à configurer." },
      "settings-plants": { title: "Gestion des usines", description: "Créez et gérez les usines ainsi que leurs responsables." },
      "settings-modules": { title: "Modules et paramètres", description: "Activez les modules globalement ou ajustez leur disponibilité par usine." },
      "settings-users": { title: "Gestion des utilisateurs", description: "Créez et gérez les utilisateurs dans le respect des niveaux d'accès existants." },
      "agent-audit": { title: "Audit de l'assistant IA", description: "Consultez les journaux d'utilisation de l'assistant IA et de ses outils." },
    },
  },
};

const MODULE_KEYS = {
  "environment-dashboard": "environmentDashboard",
  communications: "communications",
  actions: "actions",
  validation: "validation",
  sewo: "sewo",
  smat: "smat",
  "monthly-inputs": "monthlyInputs",
  contractors: "contractors",
  "occupational-health": "occupationalHealth",
  mapa: "mapa",
  admin: "admin",
  corporate: "corporate",
  settings: "settings",
} as const satisfies Record<string, keyof UiDictionary["modules"]>;

function format(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function getOnboardingCopy(locale: string | null | undefined) {
  return COPY[normalizeUiLocale(locale)];
}

export function getOnboardingStepCopy(locale: string | null | undefined, stepId: string): StepCopy | null {
  const normalizedLocale = normalizeUiLocale(locale);
  const copy = COPY[normalizedLocale];
  const specialCopy = copy.steps[stepId as SpecialStepId];
  if (specialCopy) return specialCopy;

  if (!stepId.startsWith("sidebar-")) return null;
  const moduleId = stepId.slice("sidebar-".length) as keyof typeof MODULE_KEYS;
  const moduleKey = MODULE_KEYS[moduleId];
  if (!moduleKey) return null;

  const moduleTitle = getUiDictionary(normalizedLocale).modules[moduleKey];
  return {
    title: moduleTitle,
    description: format(copy.moduleDescription, { module: moduleTitle }),
  };
}

export function formatOnboardingCopy(template: string, values: Record<string, string | number>) {
  return format(template, values);
}
