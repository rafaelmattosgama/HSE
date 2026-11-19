import type { DemoScriptStep } from "./types";

const anchor = (id: string) => `[data-onboarding="${id}"]`;

// Training script for administrators (N0): plants, users, modules and plant set-up.
export const TrainingN0Script: DemoScriptStep[] = [
  {
    id: "welcome",
    element: "body",
    section: "Início",
    copy: {
      pt: {
        title: "Formação: Administrador",
        description: "Vai praticar a configuração da plataforma: fábricas, utilizadores, módulos e dados de cada fábrica. Os dados são fictícios e pode reiniciar a demo no menu do utilizador.",
      },
      en: {
        title: "Training: Administrator",
        description: "You will practise setting up the platform: plants, users, modules and each plant's data. The data is fictitious and you can reset the demo from the user menu.",
      },
    },
  },
  {
    id: "system-settings",
    element: anchor("system-settings"),
    route: "/app/settings",
    section: "Definições",
    copy: {
      pt: {
        title: "Definições do sistema",
        description: "O ponto de partida do administrador. Daqui gere fábricas, utilizadores e módulos de todo o grupo.",
      },
      en: {
        title: "System settings",
        description: "The administrator's starting point. From here you manage plants, users and modules across the group.",
      },
    },
  },
  {
    id: "task-create-plant",
    element: anchor("settings-plants"),
    route: "/app/settings",
    section: "Fábricas",
    completeWhen: { element: anchor("plant-created") },
    copy: {
      pt: {
        title: "Tarefa: crie uma fábrica",
        description: "Preencha o código, o nome, o fuso horário e a língua, e crie a fábrica. A plataforma cria as contas iniciais e mostra as passwords temporárias.",
      },
      en: {
        title: "Task: create a plant",
        description: "Fill in the code, name, time zone and language, and create the plant. The platform creates the initial accounts and shows their temporary passwords.",
      },
    },
  },
  {
    id: "task-create-user",
    element: anchor("settings-users"),
    route: "/app/settings",
    section: "Utilizadores",
    completeWhen: { element: anchor("user-saved") },
    copy: {
      pt: {
        title: "Tarefa: crie um utilizador",
        description: "Crie um utilizador e atribua-lhe um perfil numa fábrica. O perfil define o que vê e o que pode fazer.",
      },
      en: {
        title: "Task: create a user",
        description: "Create a user and give them a role in a plant. The role defines what they see and what they can do.",
      },
    },
  },
  {
    id: "task-select-plant",
    element: anchor("system-settings"),
    route: "/app/settings",
    section: "Módulos",
    completeWhen: { element: anchor("settings-modules") },
    copy: {
      pt: {
        title: "Tarefa: escolha uma fábrica",
        description: "Nas definições, escolha a Demo Lisboa. As definições passam a mostrar os dados e os módulos dessa fábrica.",
      },
      en: {
        title: "Task: choose a plant",
        description: "In the settings, choose Demo Lisboa. The settings then show that plant's data and modules.",
      },
    },
  },
  {
    id: "settings-modules",
    element: anchor("settings-modules"),
    section: "Módulos",
    copy: {
      pt: {
        title: "Módulos por perfil",
        description: "Ative ou desative módulos para o grupo, para cada fábrica ou para cada perfil. Assim cada fábrica adota a plataforma ao seu ritmo.",
      },
      en: {
        title: "Modules by role",
        description: "Turn modules on or off for the group, for each plant or for each role. Each plant can adopt the platform at its own pace.",
      },
    },
  },
  {
    id: "plant-admin",
    element: anchor("plant-admin"),
    route: "/app/{plant}/admin",
    section: "Dados da fábrica",
    copy: {
      pt: {
        title: "Administração da fábrica",
        description: "Os dados de cada fábrica: zonas, linhas, postos, turnos e trabalhadores. São estas listas que aparecem nos formulários de registo.",
      },
      en: {
        title: "Plant administration",
        description: "Each plant's data: areas, lines, workstations, shifts and workers. These lists are what appears in the entry forms.",
      },
    },
  },
  {
    id: "alert-rules",
    element: anchor("alert-rules"),
    route: "/app/{plant}/admin",
    section: "Dados da fábrica",
    copy: {
      pt: {
        title: "Regras de alerta",
        description: "Defina quem é avisado e quando, por exemplo em ocorrências repetidas na mesma zona. Os destinatários dos emails também se gerem nesta página.",
      },
      en: {
        title: "Alert rules",
        description: "Decide who is warned and when, for example on repeated events in the same area. Email recipients are also managed on this page.",
      },
    },
  },
  {
    id: "agent-audit",
    element: anchor("agent-audit"),
    route: "/app/{plant}/admin",
    section: "Dados da fábrica",
    copy: {
      pt: {
        title: "Auditoria do assistente",
        description: "Todas as perguntas e ações feitas através do assistente de IA ficam registadas aqui, para controlo e conformidade.",
      },
      en: {
        title: "Assistant audit",
        description: "Every question and action made through the AI assistant is recorded here, for control and compliance.",
      },
    },
  },
  {
    id: "knowledge-base",
    element: anchor("knowledge-base"),
    route: "/app/corporate/knowledge-base",
    section: "Base de conhecimento",
    copy: {
      pt: {
        title: "Base de conhecimento",
        description: "Investigações aprovadas e relatórios históricos em PDF tornam-se lições aprendidas pesquisáveis. O assistente usa-as para encontrar ocorrências semelhantes.",
      },
      en: {
        title: "Knowledge base",
        description: "Approved investigations and historical PDF reports become searchable lessons learned. The assistant uses them to find similar events.",
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
        description: "Praticou a configuração da plataforma. Neste menu pode repetir a visita guiada ou reiniciar a demo para apagar o que criou.",
      },
      en: {
        title: "Training complete",
        description: "You have practised setting up the platform. From this menu you can repeat the guided tour or reset the demo to remove what you created.",
      },
    },
  },
];
