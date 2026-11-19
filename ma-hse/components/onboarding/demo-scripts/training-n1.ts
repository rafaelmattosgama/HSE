import type { DemoScriptStep } from "./types";

const anchor = (id: string) => `[data-onboarding="${id}"]`;

// Training script for corporate users (N1): group view, approvals and reports.
export const TrainingN1Script: DemoScriptStep[] = [
  {
    id: "welcome",
    element: "body",
    section: "Início",
    copy: {
      pt: {
        title: "Formação: Corporate",
        description: "Vai praticar o acompanhamento do grupo: comparar fábricas, aprovar investigações e gerar relatórios. Os dados são fictícios e pode reiniciar a demo no menu do utilizador.",
      },
      en: {
        title: "Training: Corporate",
        description: "You will practise group oversight: comparing plants, approving investigations and generating reports. The data is fictitious and you can reset the demo from the user menu.",
      },
    },
  },
  {
    id: "corporate-overview",
    element: anchor("corporate-overview"),
    route: "/app/corporate",
    section: "Visão do grupo",
    copy: {
      pt: {
        title: "Visão corporativa",
        description: "Os indicadores de todas as fábricas, consolidados automaticamente. Pode alternar entre a vista executiva e a operacional.",
      },
      en: {
        title: "Corporate view",
        description: "The indicators of every plant, consolidated automatically. You can switch between the executive and the operational view.",
      },
    },
  },
  {
    id: "corporate-comparison",
    element: anchor("corporate-comparison"),
    route: "/app/corporate",
    section: "Visão do grupo",
    copy: {
      pt: {
        title: "Comparar fábricas",
        description: "Cada métrica mostra a fábrica com melhor e com pior resultado. Use-a para decidir onde intervir primeiro.",
      },
      en: {
        title: "Comparing plants",
        description: "Each metric shows the plant with the best and the worst result. Use it to decide where to step in first.",
      },
    },
  },
  {
    id: "task-open-plant",
    element: anchor("corporate-overview"),
    route: "/app/corporate",
    section: "Visão do grupo",
    completeWhen: { route: "/app/*/dashboards" },
    copy: {
      pt: {
        title: "Tarefa: entre numa fábrica",
        description: "Abra o dashboard da Demo Lisboa. Como corporate, vê cada fábrica com o mesmo detalhe que a equipa local.",
      },
      en: {
        title: "Task: open a plant",
        description: "Open the Demo Lisboa dashboard. As corporate, you see each plant in the same detail as the local team.",
      },
    },
  },
  {
    id: "dashboard-kpis",
    element: anchor("dashboard-kpis"),
    section: "Fábrica",
    copy: {
      pt: {
        title: "Indicadores da fábrica",
        description: "Os mesmos indicadores que a fábrica vê, sem pedir relatórios. A comparação com o ano anterior usa o histórico carregado.",
      },
      en: {
        title: "Plant indicators",
        description: "The same indicators the plant sees, without asking for reports. The comparison with the previous year uses the loaded history.",
      },
    },
  },
  {
    id: "sewo-approval-queue",
    element: anchor("sewo-approval-queue"),
    route: "/app/validation",
    section: "Aprovações",
    copy: {
      pt: {
        title: "Investigações para aprovar",
        description: "As investigações S-EWO das fábricas que precisam de aprovação corporativa chegam aqui. Pode aprovar ou devolver com um comentário.",
      },
      en: {
        title: "Investigations to approve",
        description: "The plants' S-EWO investigations that need corporate approval arrive here. You can approve or send them back with a comment.",
      },
    },
  },
  {
    id: "task-approve-sewo",
    element: anchor("sewo-approval-queue"),
    route: "/app/validation",
    section: "Aprovações",
    completeWhen: { element: anchor("sewo-approval-saved") },
    copy: {
      pt: {
        title: "Tarefa: aprove uma investigação",
        description: "Reveja um S-EWO da fila e aprove-o. Pode escolher partilhá-lo com outras fábricas como lição aprendida.",
      },
      en: {
        title: "Task: approve an investigation",
        description: "Review an S-EWO in the queue and approve it. You can choose to share it with other plants as a lesson learned.",
      },
    },
  },
  {
    id: "sewo-approval-history",
    element: anchor("sewo-approval-history"),
    route: "/app/validation",
    section: "Aprovações",
    copy: {
      pt: {
        title: "Histórico de decisões",
        description: "Todas as aprovações e devoluções ficam registadas, com quem decidiu e quando.",
      },
      en: {
        title: "Decision history",
        description: "Every approval and return is recorded, with who decided and when.",
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
        description: "Os relatórios mensais e anuais do grupo, gerados a partir dos dados e guardados aqui.",
      },
      en: {
        title: "Reports",
        description: "The group's monthly and annual reports, generated from the data and stored here.",
      },
    },
  },
  {
    id: "task-generate-report",
    element: anchor("reports-generate"),
    route: "/app/corporate/reports",
    section: "Relatórios",
    completeWhen: { element: anchor("report-generated") },
    copy: {
      pt: {
        title: "Tarefa: gere um relatório",
        description: "Escolha o tipo e o período e gere o relatório. Na demo, o envio aos destinatários é simulado.",
      },
      en: {
        title: "Task: generate a report",
        description: "Choose the type and period and generate the report. In the demo, sending it to recipients is simulated.",
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
        description: "Praticou o acompanhamento corporativo. Neste menu pode repetir a visita guiada ou reiniciar a demo.",
      },
      en: {
        title: "Training complete",
        description: "You have practised corporate oversight. From this menu you can repeat the guided tour or reset the demo.",
      },
    },
  },
];
