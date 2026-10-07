import { RoleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { durationToMinutes, type PlantTrainingRow, type TrainingMetricRow } from "@/lib/plant-training";
import type { CreatePlantTrainingInput, UpsertPlantTrainingTopicInput } from "@/lib/validation/dtos";

export class PlantTrainingError extends Error {
  constructor(public readonly code: string, public readonly status = 422) { super(code); }
}

export const PlantTrainingService = {
  async list(plantId: string, viewer: { role: RoleCode; userId: string }) {
    const self = viewer.role === RoleCode.N5_OPERATOR
      ? await prisma.user.findUnique({ where: { id: viewer.userId }, select: { employeeDirectoryId: true } })
      : null;
    const [records, metricRows, workerCount, topics] = await Promise.all([
      prisma.plantTrainingRecord.findMany({
        where: { plantId, ...(viewer.role === RoleCode.N5_OPERATOR ? { traineeId: self?.employeeDirectoryId ?? "" } : {}) },
        include: { topic: { select: { name: true } }, trainers: { select: { name: true }, orderBy: { name: "asc" } } },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      }),
      prisma.plantTrainingRecord.findMany({ where: { plantId }, select: { occurredOn: true, category: true, durationMinutes: true } }),
      prisma.employeeDirectory.count({ where: { plantId, isActive: true } }),
      prisma.plantTrainingTopic.findMany({ where: { plantId }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      records: records.map(row => ({ id: row.id, topicId: row.topicId, topicName: row.topic.name, occurredOn: row.occurredOn.toISOString().slice(0, 10), category: row.category, durationMinutes: row.durationMinutes, traineeName: row.traineeName, trainers: row.trainers.map(trainer => trainer.name) })) satisfies PlantTrainingRow[],
      metricRows: metricRows.map(row => ({ ...row, occurredOn: row.occurredOn.toISOString().slice(0, 10) })) satisfies TrainingMetricRow[],
      workerCount,
      topics,
    };
  },

  async create(plantId: string, input: CreatePlantTrainingInput, actorUserId: string) {
    return prisma.$transaction(async tx => {
      const topic = await tx.plantTrainingTopic.findFirst({ where: { id: input.topicId, plantId, isActive: true } });
      if (!topic) throw new PlantTrainingError("TRAINING_TOPIC_UNAVAILABLE");
      const workerIds = [...new Set([...input.trainerIds, ...(input.traineeId ? [input.traineeId] : [])])];
      const workers = await tx.employeeDirectory.findMany({ where: { id: { in: workerIds }, plantId, isActive: true }, select: { id: true, name: true } });
      if (workers.length !== workerIds.length) throw new PlantTrainingError("TRAINING_WORKER_UNAVAILABLE");
      const names = new Map(workers.map(worker => [worker.id, worker.name]));
      const record = await tx.plantTrainingRecord.create({ data: {
        plantId,
        topicId: topic.id,
        occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
        category: input.category,
        durationMinutes: durationToMinutes(input.duration),
        traineeId: input.traineeId ?? null,
        traineeName: input.traineeId ? names.get(input.traineeId)! : input.traineeName!.trim(),
        createdByUserId: actorUserId,
        trainers: { create: input.trainerIds.map(employeeId => ({ employeeId, name: names.get(employeeId)! })) },
      } });
      await writeAuditLog({ entityType: "PlantTrainingRecord", entityId: record.id, action: "CREATE", actorUserId, plantId, diff: buildDiff(null, { ...record, trainerIds: input.trainerIds }) }, tx);
      return record;
    });
  },

  async saveTopic(plantId: string, input: UpsertPlantTrainingTopicInput, actorUserId: string) {
    return prisma.$transaction(async tx => {
      const before = input.id ? await tx.plantTrainingTopic.findFirst({ where: { id: input.id, plantId } }) : null;
      if (input.id && !before) throw new PlantTrainingError("TRAINING_TOPIC_UNAVAILABLE", 404);
      const data = { name: input.name, isActive: input.isActive };
      const topic = before
        ? await tx.plantTrainingTopic.update({ where: { id: before.id }, data })
        : await tx.plantTrainingTopic.create({ data: { ...data, plantId } });
      await writeAuditLog({ entityType: "PlantTrainingTopic", entityId: topic.id, action: before ? "UPDATE" : "CREATE", actorUserId, plantId, diff: buildDiff(before, topic) }, tx);
      return topic;
    });
  },
};
