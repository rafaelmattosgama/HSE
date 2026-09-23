import { RoleCode } from "@prisma/client";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  recipients: vi.fn(),
  db: Object.fromEntries([
    "alertRule", "area", "workstation", "equipment", "employeeDirectory", "unsafeActType", "unsafeConditionType", "nearMissType", "injuryType", "competenceType", "userPlantRole", "reportRecipientList",
  ].map(name => [name, { findMany: vi.fn(async () => []) }])),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { ...mocks.db, systemParameter: { findUnique: async () => null } } }));
vi.mock("@/lib/plant", () => ({ findPlantByCode: async (code: string) => ({ id: `id-${code}`, code, defaultLanguage: "pt" }) }));
vi.mock("@/lib/server-ui-language", () => ({ getServerUiLocale: async () => "pt" }));
vi.mock("@/lib/services/master-data-ui-localization", () => ({ getLocalizedN0MasterDataUi: async () => getStaticN0MasterDataUi("pt") }));
vi.mock("@/lib/services/master-data-translation-service", () => ({ localizeMasterDataRows: async (_type: unknown, rows: unknown[]) => rows }));
vi.mock("@/lib/services/near-miss-type-service", () => ({ ensureDefaultNearMissTypes: async () => {} }));
vi.mock("@/lib/services/unsafe-act-type-service", () => ({ ensureDefaultUnsafeActTypes: async () => {} }));
vi.mock("@/lib/services/unsafe-condition-type-service", () => ({ ensureDefaultUnsafeConditionTypes: async () => {} }));
vi.mock("@/lib/services/parameter-service", () => ({ getPlantRepeatabilityAlertConfig: async () => ({}), getPlantSafetyDaysConfig: async () => ({}) }));
vi.mock("@/lib/services/role-module-service", () => ({ getPlantRoleModuleSettings: async () => ({ authorized: {}, roles: {} }) }));
vi.mock("@/lib/services/safety-communication-alert-service", () => ({ SafetyCommunicationAlertService: { listRecipients: async () => [], listRecipientOptions: async () => ({ users: [], departments: [] }) } }));
vi.mock("@/lib/services/sewo-recipient-service", () => ({ listSewoReportRecipients: mocks.recipients, SEWO_REPORT_RECIPIENT_LANGUAGE_OPTIONS: ["pt", "en"] }));

import AdminPage from "@/app/(secure)/app/[plant]/admin/page";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { RoleModuleManager } from "@/components/feature/role-module-manager";

function recipientEditors(node: ReactNode): Array<{ plantCode: string; initialRecipients: unknown[] }> {
  if (Array.isArray(node)) return node.flatMap(recipientEditors);
  if (!isValidElement<{ children?: ReactNode; plantCode: string; initialRecipients: unknown[] }>(node)) return [];
  return node.type === SewoRecipientListManager ? [node.props] : recipientEditors(node.props.children);
}

function roleModuleEditors(node: ReactNode): Array<{ plantCode: string }> {
  if (Array.isArray(node)) return node.flatMap(roleModuleEditors);
  if (!isValidElement<{ children?: ReactNode; plantCode: string }>(node)) return [];
  return node.type === RoleModuleManager ? [node.props] : roleModuleEditors(node.props.children);
}

function expectUniqueSiblingKeys(node: ReactNode) {
  if (Array.isArray(node)) {
    const keys = node.filter(isValidElement).map(element => element.key).filter(key => key !== null);
    expect(new Set(keys).size).toBe(keys.length);
    node.forEach(expectUniqueSiblingKeys);
  } else if (isValidElement<{ children?: ReactNode }>(node)) {
    expectUniqueSiblingKeys(node.props.children);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recipients.mockResolvedValue([{ id: "recipient-1", email: "person@example.com", name: "Person", language: "pt" }]);
});

describe("plant admin recipient visibility", () => {
  it.each([RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("does not render or load recipient lists for %s", async role => {
    mocks.session.mockResolvedValue({ user: { language: "pt", plantRoles: [{ plantCode: "maap", role }] } });
    const page = await AdminPage({ params: Promise.resolve({ plant: "maap" }) });
    expectUniqueSiblingKeys(page);
    expect(recipientEditors(page)).toEqual([]);
    expect(mocks.recipients).not.toHaveBeenCalled();
    expect(mocks.db.reportRecipientList.findMany).not.toHaveBeenCalled();
    if (role === RoleCode.N3_SAFETY) {
      expect(roleModuleEditors(page)).toEqual([expect.objectContaining({ plantCode: "maap" })]);
    } else {
      expect(roleModuleEditors(page)).toEqual([]);
    }
  });

  it.each(["maap", "pl01"])("renders the editable list for N0 in plant %s", async plant => {
    mocks.session.mockResolvedValue({ user: { language: "pt", plantRoles: [{ plantCode: null, role: RoleCode.N0_ADMIN }] } });
    const page = await AdminPage({ params: Promise.resolve({ plant }) });
    expectUniqueSiblingKeys(page);
    expect(recipientEditors(page)).toEqual([expect.objectContaining({ plantCode: plant, initialRecipients: [expect.objectContaining({ email: "person@example.com" })] })]);
    expect(mocks.recipients).toHaveBeenCalledWith(`id-${plant}`);
    expect(mocks.db.reportRecipientList.findMany).not.toHaveBeenCalled();
  });
});
