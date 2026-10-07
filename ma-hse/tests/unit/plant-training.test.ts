import { describe, expect, it } from "vitest";
import { createPlantTrainingInput } from "@/lib/validation/dtos";
import { durationToMinutes, formatTrainingDuration, trainingIndicators } from "@/lib/plant-training";

const worker = "11111111-1111-4111-8111-111111111111";
const trainer = "22222222-2222-4222-8222-222222222222";
const valid = { occurredOn: "2026-10-06", topicId: worker, category: "LEGAL_REQUIREMENT", duration: "01:30", traineeId: worker, trainerIds: [trainer] };

describe("plant training input", () => {
  it("accepts a worker or one manually entered name", () => {
    expect(createPlantTrainingInput.parse(valid).duration).toBe("01:30");
    expect(createPlantTrainingInput.parse({ ...valid, traineeId: null, traineeName: "  Ana Silva  " }).traineeName).toBe("Ana Silva");
  });
  it.each([
    { duration: "00:00" }, { duration: "01:60" }, { duration: "-1:30" }, { duration: "1.5" },
    { occurredOn: "2026-02-30" }, { category: "invalid" }, { trainerIds: [] }, { trainerIds: [trainer, trainer] },
    { traineeName: "Ana" }, { traineeId: null }, { traineeId: null, traineeName: " " }, { traineeId: [worker, trainer] },
  ])("rejects invalid data %j", patch => {
    expect(createPlantTrainingInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it("accepts durations above 24 hours and has no trainer count cap", () => {
    const trainerIds = Array.from({ length: 120 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(createPlantTrainingInput.safeParse({ ...valid, duration: "120:30", trainerIds }).success).toBe(true);
    expect(durationToMinutes("120:30")).toBe(7230);
    expect(formatTrainingDuration(7230)).toBe("120:30");
  });
});

describe("annual training indicators", () => {
  it("uses minutes, compares calendar years and includes Other in percentage denominators", () => {
    const stats = trainingIndicators([
      { occurredOn: "2025-12-31", durationMinutes: 120, category: "LEGAL_REQUIREMENT" },
      { occurredOn: "2026-01-01", durationMinutes: 90, category: "LEGAL_REQUIREMENT" },
      { occurredOn: "2026-06-01", durationMinutes: 30, category: "IMPROVING_SAFETY" },
      { occurredOn: "2026-09-01", durationMinutes: 60, category: "SAFETY_CULTURE" },
      { occurredOn: "2026-12-31", durationMinutes: 60, category: "OTHER" },
      { occurredOn: "2027-01-01", durationMinutes: 9999, category: "OTHER" },
    ], 2026, 8);
    expect(stats).toMatchObject({ minutes: 240, previousMinutes: 120, changePercent: 100, hoursPerWorker: 0.5, count: 4, percentages: { LEGAL_REQUIREMENT: 25, IMPROVING_SAFETY: 25, SAFETY_CULTURE: 25, OTHER: 25 } });
  });
  it("avoids division by zero and treats a decline to no training as -100%", () => {
    expect(trainingIndicators([], 2026, 0)).toMatchObject({ minutes: 0, hoursPerWorker: null, changePercent: null, percentages: { LEGAL_REQUIREMENT: null } });
    expect(trainingIndicators([{ occurredOn: "2025-06-01", durationMinutes: 60, category: "OTHER" }], 2026, 1).changePercent).toBe(-100);
  });
});
