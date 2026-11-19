import type { DemoScriptStep } from "./types";

const anchor = (id: string) => `[data-onboarding="${id}"]`;
const plant = (path: string) => `/app/{plant}/${path}`;

// Training script for the plant safety team (N3): the daily cycle, done for real.
// Task steps ("completeWhen") wait for the user to do the task (or skip it).
export const TrainingN3Script: DemoScriptStep[] = [
  {
    id: "welcome",
    element: "body",
    section: "Início",
    copy: {
      pt: {
        title: "Formação: Técnico de Segurança",
        description: "Vai praticar o ciclo diário da segurança numa fábrica de demonstração: registar, validar, agir e fechar. Os dados são fictícios e pode reiniciar a demo a qualquer momento no menu do utilizador.",
      },
      en: {
        title: "Training: Safety Officer",
        description: "You will practise the daily safety cycle in a demo plant: report, validate, act and close. The data is fictitious and you can reset the demo at any time from the user menu.",
      },
    },
  },
  {
    id: "dashboard-kpis",
    element: anchor("dashboard-kpis"),
    route: plant("dashboards"),
    section: "Dashboard",
    copy: {
      pt: {
        title: "O seu ponto de partida",
        description: "Os indicadores da fábrica atualizam-se sozinhos à medida que as comunicações são validadas e as ações fechadas. Comece o dia por aqui.",
      },
      en: {
        title: "Your starting point",
        description: "The plant indicators update on their own as reports are validated and actions closed. Start your day here.",
      },
    },
  },
  {
    id: "dashboard-pyramid",
    element: anchor("dashboard-pyramid"),
    route: plant("dashboards"),
    section: "Dashboard",
    copy: {
      pt: {
        title: "Pirâmide de segurança",
        description: "Mostra a proporção entre situações de risco, quase acidentes e acidentes. Muitas comunicações na base são boas notícias: os riscos estão a ser vistos a tempo.",
      },
      en: {
        title: "Safety pyramid",
        description: "It shows the ratio between risk situations, near misses and accidents. Many reports at the base is good news: risks are being spotted in time.",
      },
    },
  },
  {
    id: "task-create-communication",
    element: anchor("communication-create"),
    route: plant("communications"),
    section: "Comunicações",
    completeWhen: { element: anchor("communication-created") },
    copy: {
      pt: {
        title: "Tarefa: registe uma comunicação",
        description: "Abra o registo rápido e registe uma condição insegura, por exemplo um derrame de óleo. Escolha o tipo, a zona e a descrição, e submeta.",
      },
      en: {
        title: "Task: register a report",
        description: "Open the quick entry and register an unsafe condition, for example an oil spill. Choose the type, the area and the description, then submit.",
      },
    },
  },
  {
    id: "validation-queue",
    element: anchor("validation-queue"),
    route: plant("validation"),
    section: "Validação",
    copy: {
      pt: {
        title: "Comunicações por validar",
        description: "Aqui chegam todas as comunicações novas, incluindo as feitas por QR code. Só depois de validadas contam para os indicadores.",
      },
      en: {
        title: "Reports awaiting validation",
        description: "Every new report arrives here, including those made via QR code. They only count towards the indicators once validated.",
      },
    },
  },
  {
    id: "task-validate",
    element: anchor("validation-queue"),
    route: plant("validation"),
    section: "Validação",
    completeWhen: { route: "/app/*/communications/*", element: anchor("communication-status-valid") },
    copy: {
      pt: {
        title: "Tarefa: valide uma comunicação",
        description: "Abra uma das comunicações pendentes e use o botão de validar. Confirme antes que a descrição e a classificação estão corretas.",
      },
      en: {
        title: "Task: validate a report",
        description: "Open one of the pending reports and use the validate button. First check that the description and classification are correct.",
      },
    },
  },
  {
    id: "task-create-action",
    element: anchor("action-create"),
    section: "Ações",
    completeWhen: { element: anchor("action-created") },
    copy: {
      pt: {
        title: "Tarefa: crie uma ação",
        description: "Na comunicação que acabou de validar, crie uma ação corretiva. Defina um título claro, o responsável e o prazo.",
      },
      en: {
        title: "Task: create an action",
        description: "On the report you have just validated, create a corrective action. Set a clear title, the owner and the due date.",
      },
    },
  },
  {
    id: "actions-table",
    element: anchor("actions-table"),
    route: plant("actions"),
    section: "Ações",
    copy: {
      pt: {
        title: "Acompanhar as ações",
        description: "Todas as ações da fábrica, com filtros por estado, responsável e prazo. Os responsáveis recebem alertas quando uma ação se aproxima do prazo ou fica em atraso.",
      },
      en: {
        title: "Following up actions",
        description: "Every action in the plant, with filters by status, owner and due date. Owners get alerts when an action approaches its due date or becomes overdue.",
      },
    },
  },
  {
    id: "task-close-action",
    element: anchor("actions-table"),
    route: plant("actions"),
    section: "Ações",
    completeWhen: { route: "/app/*/actions/*", element: anchor("action-closed-now") },
    copy: {
      pt: {
        title: "Tarefa: feche uma ação",
        description: "Abra uma ação em aberto e feche-a com um comentário sobre o que foi feito. Numa situação real, junte também a evidência (fotografia ou documento).",
      },
      en: {
        title: "Task: close an action",
        description: "Open an open action and close it with a comment on what was done. In a real case, also attach the evidence (photo or document).",
      },
    },
  },
  {
    id: "sewo-list",
    element: anchor("sewo-list"),
    route: plant("sewo"),
    section: "S-EWO",
    copy: {
      pt: {
        title: "Investigações S-EWO",
        description: "Quase acidentes, primeiros socorros e acidentes validados abrem uma investigação S-EWO. Cada uma segue para aprovação depois de preenchida.",
      },
      en: {
        title: "S-EWO investigations",
        description: "Validated near misses, first-aid cases and accidents open an S-EWO investigation. Each one goes for approval once completed.",
      },
    },
  },
  {
    id: "task-open-sewo",
    element: anchor("sewo-list"),
    route: plant("sewo"),
    section: "S-EWO",
    completeWhen: { element: anchor("sewo-root-causes") },
    copy: {
      pt: {
        title: "Tarefa: abra uma investigação",
        description: "Abra um S-EWO da lista e percorra-o até à análise de causa raiz. Veja como as causas são escolhidas a partir do catálogo.",
      },
      en: {
        title: "Task: open an investigation",
        description: "Open an S-EWO from the list and scroll to the root-cause analysis. See how causes are picked from the catalogue.",
      },
    },
  },
  {
    id: "task-competences",
    element: anchor("competences-areas"),
    route: plant("competences"),
    section: "Competências",
    completeWhen: { element: anchor("competence-cell-panel") },
    copy: {
      pt: {
        title: "Tarefa: consulte uma competência",
        description: "Entre na área de competências e clique numa célula da matriz. No painel que abre vê a formação, a avaliação e a autorização desse trabalhador.",
      },
      en: {
        title: "Task: check a competence",
        description: "Go to the competences area and click a cell in the matrix. The panel that opens shows that worker's training, assessment and authorisation.",
      },
    },
  },
  {
    id: "fire-equipment-list",
    element: anchor("fire-equipment-list"),
    route: plant("fire-equipment"),
    section: "SCIE",
    copy: {
      pt: {
        title: "Equipamentos de emergência",
        description: "Cada equipamento tem inspeções trimestrais e anuais. A lista mostra o que está em dia, em atraso ou nunca foi inspecionado.",
      },
      en: {
        title: "Fire safety equipment",
        description: "Each item has quarterly and annual inspections. The list shows what is up to date, overdue or never inspected.",
      },
    },
  },
  {
    id: "task-fire-inspection",
    element: anchor("fire-equipment-list"),
    route: plant("fire-equipment"),
    section: "SCIE",
    completeWhen: { element: anchor("fire-inspection-form") },
    copy: {
      pt: {
        title: "Tarefa: inicie uma inspeção",
        description: "Abra um equipamento em atraso e clique em nova verificação. Pode preencher a checklist ou fechá-la sem gravar.",
      },
      en: {
        title: "Task: start an inspection",
        description: "Open an overdue item and click new inspection. You can fill in the checklist or close it without saving.",
      },
    },
  },
  {
    id: "alerts-panel",
    element: anchor("alerts-panel"),
    route: "/app/alerts",
    section: "Alertas",
    copy: {
      pt: {
        title: "Os seus alertas",
        description: "Prazos a aproximar-se, autorizações a expirar e não conformidades chegam aqui e por email. Marque-os como lidos depois de os tratar.",
      },
      en: {
        title: "Your alerts",
        description: "Upcoming due dates, expiring authorisations and non-conformities arrive here and by email. Mark them as read once handled.",
      },
    },
  },
  {
    id: "ai-assistant",
    element: anchor("ai-assistant"),
    route: plant("dashboards"),
    section: "Assistente IA",
    copy: {
      pt: {
        title: "Assistente de segurança",
        description: "Pergunte, por exemplo, \"quais as ações em atraso?\" ou \"houve ocorrências semelhantes?\". Antes de alterar dados, o assistente pede sempre confirmação.",
      },
      en: {
        title: "Safety assistant",
        description: "Ask, for example, \"which actions are overdue?\" or \"were there similar events?\". Before changing data, the assistant always asks for confirmation.",
      },
    },
  },
  {
    id: "closing",
    element: anchor("user-menu"),
    section: "Fim",
    copy: {
      pt: {
        title: "Formação concluída",
        description: "Praticou o ciclo completo da segurança na fábrica. Neste menu pode repetir a visita guiada ou reiniciar a demo para recomeçar com os dados iniciais.",
      },
      en: {
        title: "Training complete",
        description: "You have practised the full plant safety cycle. From this menu you can repeat the guided tour or reset the demo to start again with the initial data.",
      },
    },
  },
];
