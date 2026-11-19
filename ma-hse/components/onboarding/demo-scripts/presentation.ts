import type { DemoScriptStep } from "./types";

const anchor = (id: string) => `[data-onboarding="${id}"]`;
const plant = (path: string) => `/app/{plant}/${path}`;

// Presentation script (calls / conferences): a guided tour of the whole platform.
// Short copy: the presenter talks over it. Max 2 sentences per description.
export const PresentationScript: DemoScriptStep[] = [
  {
    id: "welcome",
    element: "body",
    section: "Início",
    copy: {
      pt: {
        title: "MAx Safety",
        description: "Uma plataforma única para a segurança de várias fábricas: comunicações, investigação, ações, competências e equipamentos de emergência. Tudo o que vamos ver usa dados fictícios.",
      },
      en: {
        title: "MAx Safety",
        description: "One platform for safety across several plants: reports, investigations, actions, competences and fire safety equipment. Everything you will see uses fictitious data.",
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
        title: "Indicadores da fábrica",
        description: "Os principais indicadores de segurança, calculados automaticamente a partir dos registos. Sem folhas de cálculo nem consolidação manual.",
      },
      en: {
        title: "Plant indicators",
        description: "The key safety indicators, calculated automatically from the records. No spreadsheets and no manual consolidation.",
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
        description: "Da base (atos e condições inseguras) ao topo (acidentes). Uma base larga de comunicações é o sinal de uma cultura de prevenção.",
      },
      en: {
        title: "Safety pyramid",
        description: "From the base (unsafe acts and conditions) to the top (accidents). A wide base of reports is the sign of a prevention culture.",
      },
    },
  },
  {
    id: "communications-list",
    element: anchor("communications-list"),
    route: plant("communications"),
    section: "Comunicações",
    copy: {
      pt: {
        title: "Comunicações de segurança",
        description: "Qualquer trabalhador comunica uma situação em segundos, por QR code no posto ou no quiosque, sem precisar de conta. Cada comunicação recebe um código e é acompanhada até ao fecho.",
      },
      en: {
        title: "Safety reports",
        description: "Any worker reports a situation in seconds, via a QR code at the workstation or the kiosk, without an account. Every report gets a code and is followed until it is closed.",
      },
    },
  },
  {
    id: "communication-create",
    element: anchor("communication-create"),
    route: plant("communications"),
    section: "Comunicações",
    copy: {
      pt: {
        title: "Registo rápido",
        description: "A equipa de segurança também regista diretamente aqui. Os campos adaptam-se ao tipo de ocorrência.",
      },
      en: {
        title: "Quick entry",
        description: "The safety team can also register directly here. The fields adapt to the type of event.",
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
        title: "Validação pela Segurança",
        description: "Cada comunicação é revista antes de contar para os indicadores. Os casos com lesão geram automaticamente uma investigação S-EWO.",
      },
      en: {
        title: "Safety validation",
        description: "Every report is reviewed before it counts towards the indicators. Injury cases automatically open an S-EWO investigation.",
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
        title: "Investigação S-EWO",
        description: "Análise estruturada do que aconteceu, com catálogo de causas e identificação da causa raiz. Cada análise passa por aprovação antes de fechar.",
      },
      en: {
        title: "S-EWO investigation",
        description: "A structured analysis of what happened, with a cause catalogue and root-cause identification. Every analysis is approved before it closes.",
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
        title: "Plano de ações",
        description: "Ações corretivas e preventivas com responsável, prazo e evidência de fecho. Os atrasos ficam visíveis e geram alertas.",
      },
      en: {
        title: "Action plan",
        description: "Corrective and preventive actions with an owner, a due date and closing evidence. Delays are visible and trigger alerts.",
      },
    },
  },
  {
    id: "competences-areas",
    element: anchor("competences-areas"),
    route: plant("competences"),
    section: "Competências",
    copy: {
      pt: {
        title: "Formação e competências",
        description: "Matriz de competências por trabalhador, com formação, avaliação prática e autorização. A plataforma avisa antes de uma autorização expirar.",
      },
      en: {
        title: "Training and competences",
        description: "A competence matrix per worker, with training, practical assessment and authorisation. The platform warns before an authorisation expires.",
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
        description: "Extintores, carretéis e iluminação de emergência, com checklists trimestrais e anuais. Inspeções em atraso e não conformidades ficam à vista.",
      },
      en: {
        title: "Fire safety equipment",
        description: "Extinguishers, hose reels and emergency lighting, with quarterly and annual checklists. Overdue inspections and non-conformities stand out.",
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
        description: "Perguntas em linguagem natural sobre os dados da fábrica: indicadores, ações em atraso, ocorrências semelhantes. Responde só com a informação a que o utilizador tem acesso.",
      },
      en: {
        title: "Safety assistant",
        description: "Plain-language questions about the plant's data: indicators, overdue actions, similar events. It only answers with information the user is allowed to see.",
      },
    },
  },
  {
    id: "corporate-overview",
    element: anchor("corporate-overview"),
    route: "/app/corporate",
    section: "Corporativo",
    copy: {
      pt: {
        title: "Visão corporativa",
        description: "A mesma informação, agregada para todas as fábricas do grupo. A gestão vê o grupo inteiro num só sítio.",
      },
      en: {
        title: "Corporate view",
        description: "The same information, aggregated for every plant in the group. Management sees the whole group in one place.",
      },
    },
  },
  {
    id: "corporate-comparison",
    element: anchor("corporate-comparison"),
    route: "/app/corporate",
    section: "Corporativo",
    copy: {
      pt: {
        title: "Comparação entre fábricas",
        description: "Indicadores lado a lado, com as melhores e as piores fábricas em cada métrica. Ajuda a partilhar boas práticas entre unidades.",
      },
      en: {
        title: "Plant comparison",
        description: "Indicators side by side, with the best and worst plants on each metric. It helps share good practice between sites.",
      },
    },
  },
  {
    id: "sewo-approval-queue",
    element: anchor("sewo-approval-queue"),
    route: "/app/validation",
    section: "Corporativo",
    copy: {
      pt: {
        title: "Aprovação corporativa",
        description: "As investigações mais graves sobem para aprovação corporativa. Nada fecha sem a revisão certa.",
      },
      en: {
        title: "Corporate approval",
        description: "The most serious investigations go up for corporate approval. Nothing closes without the right review.",
      },
    },
  },
  {
    id: "reports-page",
    element: anchor("reports-page"),
    route: "/app/corporate/reports",
    section: "Relatórios",
    copy: {
      pt: {
        title: "Relatórios",
        description: "Relatórios mensais e anuais gerados automaticamente e partilhados com os destinatários certos. Sem preparar apresentações à mão.",
      },
      en: {
        title: "Reports",
        description: "Monthly and annual reports generated automatically and shared with the right recipients. No more building slides by hand.",
      },
    },
  },
  {
    id: "closing",
    element: "body",
    section: "Fim",
    copy: {
      pt: {
        title: "Obrigado",
        description: "Vimos o ciclo completo: comunicar, validar, investigar, agir e acompanhar. A base de conhecimento junta ainda as lições aprendidas de todo o grupo, para que uma ocorrência numa fábrica previna a próxima noutra.",
      },
      en: {
        title: "Thank you",
        description: "We have seen the full cycle: report, validate, investigate, act and follow up. The knowledge base also brings together lessons learned across the group, so an event in one plant prevents the next one elsewhere.",
      },
    },
  },
];
