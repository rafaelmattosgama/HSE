import { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { filterDashboardDepartment, resolveDashboardDepartment } from "@/lib/dashboard-departments";

const defaults = { requested: undefined, role: RoleCode.N2_PLANT_MANAGER, assignedDepartmentId: "a", departments: [{ id: "a" }, { id: "b" }] };

describe("safety dashboard department scope", () => {
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("defaults %s to its assigned department", role => {
    expect(resolveDashboardDepartment({ ...defaults, role })).toBe("a");
  });
  it.each([RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("defaults %s to the whole plant", role => {
    expect(resolveDashboardDepartment({ ...defaults, role })).toBeNull();
  });
  it("honours an explicit department and an explicit all selection", () => {
    expect(resolveDashboardDepartment({ ...defaults, requested: "b" })).toBe("b");
    expect(resolveDashboardDepartment({ ...defaults, requested: "all" })).toBeNull();
    expect(resolveDashboardDepartment({ ...defaults, requested: ["b", "a"] })).toBe("b");
  });
  it("does not accept a department from another plant", () => {
    expect(resolveDashboardDepartment({ ...defaults, requested: "other-plant" })).toBe("a");
    expect(resolveDashboardDepartment({ ...defaults, assignedDepartmentId: "other-plant" })).toBeNull();
  });
  it("handles legacy users without an associated department", () => {
    expect(resolveDashboardDepartment({ ...defaults, assignedDepartmentId: null })).toBeNull();
  });
  it("filters records by their department and keeps unassigned records only in the all view", () => {
    const rows = [{ areaId: "a" }, { areaId: "b" }, { areaId: null }];
    expect(filterDashboardDepartment(rows, "a")).toEqual([{ areaId: "a" }]);
    expect(filterDashboardDepartment(rows, null)).toEqual(rows);
    expect(filterDashboardDepartment(rows, "empty")).toEqual([]);
  });
  it("uses the linked communication for S-EWO without overriding an explicit S-EWO department", () => {
    const rows = [{ areaId: null, communication: { areaId: "a" } }, { areaId: "b", communication: { areaId: "a" } }];
    expect(filterDashboardDepartment(rows, "a")).toEqual([rows[0]]);
  });
});
