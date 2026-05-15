import { describe, expect, it } from "vitest";
import {
  calculateAgeOnDate,
  calculateOccupationalHealthExamValidUntil,
  calculateOccupationalHealthExamValidUntilInput,
  formatDateInputValue,
} from "@/lib/occupational-health-validity";

describe("occupational health exam validity", () => {
  it("sets a 1 year validity when the worker is older than 50", () => {
    const validUntil = calculateOccupationalHealthExamValidUntil({
      birthDate: new Date("1975-01-14"),
      examDate: new Date("2026-01-15"),
      referenceDate: new Date("2026-01-15"),
    });

    expect(formatDateInputValue(validUntil)).toBe("2027-01-15");
  });

  it("sets a 2 year validity when the worker is exactly 50", () => {
    const validUntil = calculateOccupationalHealthExamValidUntil({
      birthDate: new Date("1976-01-15"),
      examDate: new Date("2026-01-15"),
      referenceDate: new Date("2026-01-15"),
    });

    expect(formatDateInputValue(validUntil)).toBe("2028-01-15");
  });

  it("sets a 2 year validity until the worker has completed 51 years", () => {
    expect(calculateAgeOnDate(new Date("1975-05-01"), new Date("2026-04-30"))).toBe(50);
    expect(
      calculateOccupationalHealthExamValidUntilInput(
        "1975-05-01",
        "2026-04-30",
        new Date("2026-04-30"),
      ),
    ).toBe("2028-04-30");
  });

  it("keeps leap day validity on the last valid day of February", () => {
    const validUntil = calculateOccupationalHealthExamValidUntil({
      birthDate: new Date("1970-01-01"),
      examDate: new Date("2024-02-29"),
      referenceDate: new Date("2026-01-15"),
    });

    expect(formatDateInputValue(validUntil)).toBe("2025-02-28");
  });
});
