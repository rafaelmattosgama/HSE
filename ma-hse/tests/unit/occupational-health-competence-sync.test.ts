import { describe, expect, it } from "vitest";
import { upsertOccupationalHealthWorkerInput } from "@/lib/validation/dtos";

describe("occupational-health worker profile input", () => {
  it("allows a worker to exist before any examination is registered", () => {
    const parsed = upsertOccupationalHealthWorkerInput.safeParse({
      employeeNo: "1001",
      name: "Maria Silva",
      birthDate: "1970-01-01",
      gender: "FEMALE",
      hireDate: "2020-01-01",
      roleStartDate: "2021-01-01",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.examDate).toBeUndefined();
  });
});
