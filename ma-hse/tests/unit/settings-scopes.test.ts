import { RoleCode } from "@prisma/client";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";
import { getUiDictionary } from "@/lib/ui-language";

const mocks = vi.hoisted(() => ({ plants: vi.fn(), plant: vi.fn(), catalog: vi.fn(), recipients: vi.fn(), users: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { language: "pt", plantRoles: [{ role: "N0_ADMIN" }] } }) }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { plant: { findMany: mocks.plants, findUnique: mocks.plant }, systemParameter: { findFirst: async () => null } } }));
vi.mock("@/lib/services/general-settings-service", () => ({ readGeneralCatalog: mocks.catalog }));
vi.mock("@/lib/services/general-sewo-recipients", () => ({ readGeneralSewoRecipients: mocks.recipients }));
vi.mock("@/lib/services/general-user-service", () => ({ listGeneralUsers: mocks.users, GENERAL_USER_ROLES: ["N0_ADMIN", "N1_CORPORATE", "N3_SAFETY"] }));
vi.mock("@/lib/server-ui-language", () => ({ getServerUiLocale: async () => "pt", getServerUiDictionary: async () => getUiDictionary("pt") }));
vi.mock("@/lib/services/master-data-ui-localization", () => ({ getLocalizedN0MasterDataUi: async () => getStaticN0MasterDataUi("pt") }));
vi.mock("@/lib/services/master-data-translation-service", () => ({ localizeMasterDataRows: async (_type: unknown, rows: unknown[]) => rows }));
vi.mock("@/lib/services/safety-communication-alert-service", () => ({ SafetyCommunicationAlertService: { listRecipients: async () => [], listRecipientOptions: async () => ({ users: [], departments: [] }) } }));

import SettingsPage from "@/app/(secure)/app/settings/page";
import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { ProfessionalRisksManager } from "@/components/feature/professional-risks-manager";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { SettingsPlantSelector } from "@/components/feature/settings-plant-selector";
import { UserManager } from "@/components/feature/user-manager";
import { ModuleToggleManager } from "@/components/feature/module-toggle-manager";
import { SafetyCommunicationRecipientManager } from "@/components/feature/safety-communication-recipient-manager";

function propsOf(node: ReactNode, type: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(child => propsOf(child, type));
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  return node.type === type ? [node.props] : propsOf(node.props.children, type);
}
const plants = [{ id: "p1", code: "pl1", name: "Plant One", defaultLanguage: "pt", timezone: "Europe/Lisbon", isActive: true }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.plants.mockResolvedValue(plants);
  mocks.catalog.mockResolvedValue([]);
  mocks.recipients.mockResolvedValue([]);
  mocks.users.mockResolvedValue([]);
  mocks.plant.mockResolvedValue({ ...plants[0], areas: [], workstations: [], equipments: [], employees: [], systemParameters: [],
    users: Object.values(RoleCode).map(role => ({ role: { code: role }, user: { id: role, name: role, email: `${role}@example.com`, language: "pt", isActive: true, createdAt: new Date(), updatedAt: new Date() } })),
  });
});

describe("N0 settings sections", () => {
  it.each([undefined, "pl1"])("shows common configuration independently of selected plant %s", async plant => {
    const page = await SettingsPage({ searchParams: Promise.resolve({ scope: "general", plant }) });
    expect(propsOf(page, CorporatePlantForm)).toMatchObject([{ mode: "create" }]);
    expect(propsOf(page, SettingsPlantSelector)).toHaveLength(0);
    expect(propsOf(page, N0MasterDataManager)).toMatchObject([{ scope: "general", showWorkers: false, catalogEndpoint: "/api/admin/master-data", visibleCatalogTypes: ["unsafeActType", "unsafeConditionType", "nearMissType", "injuryType"] }]);
    expect(propsOf(page, ProfessionalRisksManager)).toMatchObject([{ endpoint: "/api/admin/professional-risks" }]);
    expect(propsOf(page, SewoRecipientListManager)).toMatchObject([{ endpoint: "/api/admin/sewo-report-recipients" }]);
    expect(propsOf(page, UserManager)).toMatchObject([{ endpoint: "/api/admin/users", allowedCreateRoles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] }]);
    expect(propsOf(page, ModuleToggleManager)).toHaveLength(0);
    expect(propsOf(page, SafetyCommunicationRecipientManager)).toHaveLength(0);
    expect(mocks.plant).not.toHaveBeenCalled();
  });

  it("keeps common settings available before the first factory is created", async () => {
    mocks.plants.mockResolvedValue([]);
    const page = await SettingsPage({ searchParams: Promise.resolve({}) });
    expect(propsOf(page, CorporatePlantForm)).toMatchObject([{ mode: "create" }]);
    expect(propsOf(page, UserManager)).toHaveLength(1);
    expect(propsOf(page, ProfessionalRisksManager)).toHaveLength(1);
  });

  it("shows one plant selector and only the requested plant-specific sections and roles", async () => {
    const page = await SettingsPage({ searchParams: Promise.resolve({ scope: "plant", plant: "pl1" }) });
    expect(propsOf(page, SettingsPlantSelector)).toMatchObject([{ selectedPlantCode: "pl1" }]);
    expect(propsOf(page, CorporatePlantForm)).toMatchObject([{ mode: "manage", selectedPlantId: "p1" }]);
    expect(propsOf(page, N0MasterDataManager)).toMatchObject([{ plantCode: "pl1", visibleCatalogTypes: ["area", "workstation", "equipment"] }]);
    expect(propsOf(page, ModuleToggleManager)).toMatchObject([{ endpoint: "/api/plants/pl1/admin/modules" }]);
    expect(propsOf(page, SafetyCommunicationRecipientManager)).toMatchObject([{ plantCode: "pl1" }]);
    const manager = propsOf(page, UserManager)[0];
    expect(manager.allowedCreateRoles).toEqual([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N6_HR]);
    expect((manager.users as Array<{ role: string }>).map(user => user.role).sort()).toEqual([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N6_HR].sort());
    expect(propsOf(page, ProfessionalRisksManager)).toHaveLength(0);
    expect(propsOf(page, SewoRecipientListManager)).toHaveLength(0);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
