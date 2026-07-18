import type { RoleCode } from "@prisma/client";
import { getOnboardingStepCopy } from "@/components/onboarding/onboarding-i18n";
import type { OnboardingStep, OnboardingUserContext, RoleOnboardingConfig } from "@/components/onboarding/onboarding-types";

export const ONBOARDING_PERMISSIONS = {
  AI_ASSISTANT: "ai-assistant",
  PLANT_CONTEXT: "plant-context",
  PROFILE_ALERTS: "profile-alerts",
} as const;

const firstLogin = { kind: "FIRST_LOGIN" as const };
const plantRoute = "/app/{plant}/dashboards";

const topbarStep: OnboardingStep = {
  ...firstLogin,
  id: "topbar",
  element: '[data-onboarding="topbar"]',
  title: "Acesso rápido",
  description: "Aqui encontra os alertas, o tema e as opções da sua conta.",
};

const dashboardStep: OnboardingStep = {
  ...firstLogin,
  id: "dashboard-overview",
  element: '[data-onboarding="dashboard-overview"]',
  title: "Dashboard da fábrica",
  description: "Consulte os principais indicadores de segurança e acompanhe a evolução da fábrica.",
  route: plantRoute,
  requiredPermission: ONBOARDING_PERMISSIONS.PLANT_CONTEXT,
};

const sidebarStep: OnboardingStep = {
  ...firstLogin,
  id: "sidebar",
  element: '[data-onboarding="sidebar"]',
  title: "Menu lateral",
  description: "Use este menu para aceder aos módulos disponíveis para o seu perfil e para esta fábrica.",
  requiredPermission: ONBOARDING_PERMISSIONS.PLANT_CONTEXT,
};

function sidebarModule(id: string, title: string, description: string): OnboardingStep {
  return {
    ...firstLogin,
    id: `sidebar-${id}`,
    element: `[data-onboarding="sidebar-${id}"]`,
    title,
    description,
    requiredPermission: ONBOARDING_PERMISSIONS.PLANT_CONTEXT,
  };
}

const notificationsStep: OnboardingStep = {
  ...firstLogin,
  id: "notifications",
  element: '[data-onboarding="notifications"]',
  title: "Notificações",
  description: "Consulte os alertas associados às suas responsabilidades e marque-os como lidos.",
  requiredPermission: ONBOARDING_PERMISSIONS.PROFILE_ALERTS,
};

const agentStep: OnboardingStep = {
  ...firstLogin,
  id: "ai-assistant",
  element: '[data-onboarding="ai-assistant"]',
  title: "Assistente IA",
  description: "Peça apoio para consultar informação e executar operações permitidas, sempre dentro do seu nível de acesso.",
  requiredPermission: ONBOARDING_PERMISSIONS.AI_ASSISTANT,
};

const userMenuStep: OnboardingStep = {
  ...firstLogin,
  id: "user-menu",
  element: '[data-onboarding="user-menu"]',
  title: "Conta e ajuda",
  description: "Altere as suas definições ou reinicie esta visita guiada quando precisar.",
};

const corporateOverviewStep: OnboardingStep = {
  ...firstLogin,
  id: "corporate-overview",
  element: '[data-onboarding="corporate-overview"]',
  title: "Dashboard corporativo",
  description: "Acompanhe indicadores globais e compare o desempenho das fábricas.",
  route: "/app/corporate",
};

const corporateComparisonStep: OnboardingStep = {
  ...firstLogin,
  id: "corporate-comparison",
  element: '[data-onboarding="corporate-comparison"]',
  title: "Comparação entre fábricas",
  description: "Explore indicadores, tendências e rankings entre as várias unidades.",
};

const corporateActionsStep: OnboardingStep = {
  ...firstLogin,
  id: "corporate-actions",
  element: '[data-onboarding="corporate-actions"]',
  title: "Ações corporativas",
  description: "Acompanhe ações abertas e em atraso em todas as fábricas.",
};

const corporateReportsStep: OnboardingStep = {
  ...firstLogin,
  id: "corporate-reports",
  element: '[data-onboarding="corporate-reports"]',
  title: "Relatórios corporativos",
  description: "Consulte o histórico de relatórios globais e por fábrica.",
};

const roleConfigs: Record<RoleCode, RoleOnboardingConfig> = {
  N0_ADMIN: {
    role: "N0_ADMIN",
    steps: [
      topbarStep,
      {
        ...firstLogin,
        id: "system-settings",
        element: '[data-onboarding="system-settings"]',
        title: "Configuração global",
        description: "Administre as definições globais do MA HSE e selecione a fábrica a configurar.",
        route: "/app/settings",
      },
      {
        ...firstLogin,
        id: "settings-plants",
        element: '[data-onboarding="settings-plants"]',
        title: "Gestão de fábricas",
        description: "Crie e mantenha as fábricas e os respetivos responsáveis.",
      },
      {
        ...firstLogin,
        id: "settings-modules",
        element: '[data-onboarding="settings-modules"]',
        title: "Módulos e configurações",
        description: "Ative os módulos globalmente ou ajuste a disponibilidade por fábrica.",
      },
      {
        ...firstLogin,
        id: "settings-users",
        element: '[data-onboarding="settings-users"]',
        title: "Gestão de utilizadores",
        description: "Crie e administre utilizadores respeitando os níveis de acesso existentes.",
      },
      corporateOverviewStep,
      corporateComparisonStep,
      corporateReportsStep,
      dashboardStep,
      sidebarModule("admin", "Administração da fábrica", "Aceda às configurações e ferramentas administrativas desta fábrica."),
      {
        ...firstLogin,
        id: "agent-audit",
        element: '[data-onboarding="agent-audit"]',
        title: "Auditoria do agente",
        description: "Consulte os registos de utilização do assistente IA e das respetivas ferramentas.",
        route: "/app/{plant}/admin",
        requiredPermission: ONBOARDING_PERMISSIONS.PLANT_CONTEXT,
      },
      agentStep,
      userMenuStep,
    ],
  },
  N1_CORPORATE: {
    role: "N1_CORPORATE",
    steps: [
      topbarStep,
      corporateOverviewStep,
      corporateComparisonStep,
      corporateActionsStep,
      corporateReportsStep,
      dashboardStep,
      sidebarStep,
      sidebarModule("actions", "Ações", "Acompanhe planos de ação, responsáveis, prazos e evidências."),
      sidebarModule("communications", "Comunicações", "Consulte comunicações de segurança de todas as fábricas."),
      sidebarModule("admin", "Administração", "Aceda às ferramentas administrativas disponíveis para o perfil corporate."),
      agentStep,
      userMenuStep,
    ],
  },
  N2_PLANT_MANAGER: {
    role: "N2_PLANT_MANAGER",
    steps: [
      topbarStep,
      dashboardStep,
      sidebarStep,
      sidebarModule("environment-dashboard", "Dashboard ambiental", "Acompanhe os principais indicadores ambientais da fábrica."),
      sidebarModule("communications", "Comunicações", "Consulte comunicações e acompanhe o respetivo estado."),
      sidebarModule("actions", "Ações", "Acompanhe ações, responsáveis, prazos e evidências."),
      sidebarModule("sewo", "S-EWO", "Consulte análises estruturadas de ocorrências e respetivos planos de ação."),
      sidebarModule("smat", "Auditorias SMAT", "Registe e consulte auditorias comportamentais de segurança."),
      sidebarModule("monthly-inputs", "Indicadores mensais", "Registe os dados mensais usados nos indicadores da fábrica."),
      sidebarModule("mapa", "MAPA", "Explore informação de segurança associada ao mapa da fábrica."),
      sidebarModule("admin", "Administração", "Consulte as configurações administrativas disponíveis para a gestão da fábrica."),
      sidebarModule("corporate", "Visão corporativa", "Regresse à visão agregada para comparar indicadores entre fábricas."),
      userMenuStep,
    ],
  },
  N3_SAFETY: {
    role: "N3_SAFETY",
    steps: [
      topbarStep,
      notificationsStep,
      dashboardStep,
      sidebarStep,
      sidebarModule("communications", "Comunicações", "Registe, valide e acompanhe comunicações de segurança."),
      sidebarModule("actions", "Ações", "Crie e acompanhe ações, responsáveis, prazos e evidências."),
      sidebarModule("validation", "Validações", "Trate as comunicações que aguardam validação de segurança."),
      sidebarModule("sewo", "S-EWO", "Investigue ocorrências e acompanhe causas e planos de ação."),
      sidebarModule("smat", "Auditorias SMAT", "Registe e consulte auditorias comportamentais de segurança."),
      sidebarModule("occupational-health", "Saúde ocupacional", "Acompanhe a informação de saúde ocupacional autorizada."),
      sidebarModule("contractors", "Prestadores", "Acompanhe empresas externas, trabalhadores e documentação."),
      sidebarModule("mapa", "MAPA", "Explore informação de segurança associada ao mapa da fábrica."),
      sidebarModule("admin", "Administração e dados de segurança", "Gira utilizadores permitidos, alertas e dados administrativos da fábrica."),
      agentStep,
      userMenuStep,
    ],
  },
  N4_SUPERVISOR: {
    role: "N4_SUPERVISOR",
    steps: [
      topbarStep,
      notificationsStep,
      dashboardStep,
      sidebarStep,
      sidebarModule("communications", "Comunicações", "Registe e consulte comunicações de segurança."),
      sidebarModule("actions", "Ações", "Crie, acompanhe e encerre as ações pelas quais é responsável."),
      sidebarModule("smat", "Auditorias SMAT", "Registe e consulte auditorias comportamentais de segurança."),
      sidebarModule("contractors", "Prestadores", "Consulte e acompanhe os prestadores autorizados."),
      sidebarModule("mapa", "MAPA", "Explore informação de segurança associada ao mapa da fábrica."),
      userMenuStep,
    ],
  },
  N5_OPERATOR: {
    role: "N5_OPERATOR",
    steps: [
      topbarStep,
      dashboardStep,
      sidebarStep,
      sidebarModule("communications", "Comunicações", "Registe situações e sugestões de segurança e acompanhe o respetivo estado."),
      sidebarModule("actions", "Ações", "Consulte as ações associadas ao seu trabalho."),
      sidebarModule("mapa", "MAPA", "Explore a informação disponível no mapa da fábrica."),
      userMenuStep,
    ],
  },
  MEDICO: {
    role: "MEDICO",
    steps: [topbarStep, dashboardStep, userMenuStep],
  },
};

export function resolveOnboardingRoute(route: string | undefined, plantCode: string | null) {
  if (!route) return undefined;
  if (!route.includes("{plant}")) return route;
  return plantCode ? route.replaceAll("{plant}", encodeURIComponent(plantCode)) : undefined;
}

export function getOnboardingSteps(context: OnboardingUserContext) {
  const permissionSet = new Set(context.permissions);
  const config = roleConfigs[context.role];

  return config.steps
    .filter((step) => !step.requiredPermission || permissionSet.has(step.requiredPermission))
    .map((step) => {
      const localizedCopy = getOnboardingStepCopy(context.locale, step.id);
      return {
        ...step,
        ...(localizedCopy ?? {}),
        route: resolveOnboardingRoute(step.route, context.plantCode),
      };
    });
}

export const ROLE_ONBOARDING_CONFIGS = roleConfigs;
