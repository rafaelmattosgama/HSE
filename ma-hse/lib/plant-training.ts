export const TRAINING_CATEGORIES = ["LEGAL_REQUIREMENT", "IMPROVING_SAFETY", "SAFETY_CULTURE", "OTHER"] as const;
export type TrainingCategory = typeof TRAINING_CATEGORIES[number];
export const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  LEGAL_REQUIREMENT: "Legal Requirement",
  IMPROVING_SAFETY: "Improving Safety",
  SAFETY_CULTURE: "Safety Culture",
  OTHER: "Other",
};

export type TrainingTopicOption = { id: string; name: string; isActive: boolean };
export type TrainingWorkerOption = { id: string; employeeNo: string; name: string };
export type TrainingMetricRow = { occurredOn: string; category: TrainingCategory; durationMinutes: number };
export type PlantTrainingRow = TrainingMetricRow & {
  id: string;
  topicId: string;
  topicName: string;
  traineeName: string;
  trainers: string[];
};

export function durationToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatTrainingDuration(minutes: number) {
  return `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

/** Each record represents one trainee. Instructor count never multiplies the hours. */
export function trainingIndicators(rows: TrainingMetricRow[], year: number, workerCount: number) {
  const annual = rows.filter(row => Number(row.occurredOn.slice(0, 4)) === year);
  const minutes = annual.reduce((sum, row) => sum + row.durationMinutes, 0);
  const previousMinutes = rows.filter(row => Number(row.occurredOn.slice(0, 4)) === year - 1)
    .reduce((sum, row) => sum + row.durationMinutes, 0);
  return {
    minutes,
    previousMinutes,
    changePercent: previousMinutes > 0 ? (minutes - previousMinutes) / previousMinutes * 100 : null,
    hoursPerWorker: workerCount > 0 ? minutes / 60 / workerCount : null,
    count: annual.length,
    percentages: Object.fromEntries(TRAINING_CATEGORIES.map(category => [category,
      annual.length ? annual.filter(row => row.category === category).length / annual.length * 100 : null,
    ])) as Record<TrainingCategory, number | null>,
  };
}
