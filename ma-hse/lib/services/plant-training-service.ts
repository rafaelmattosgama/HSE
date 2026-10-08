import { RoleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { CompetenceService } from "@/lib/services/competence-service";
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
        include: { topic: { select: { name: true } }, trainers: { select: { employeeId: true, name: true }, orderBy: { name: "asc" } }, attendees: { select: { employeeId: true, name: true }, orderBy: { name: "asc" } } },
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      }),
      prisma.plantTrainingRecord.findMany({ where: { plantId }, select: { occurredOn: true, category: true, durationMinutes: true } }),
      prisma.employeeDirectory.count({ where: { plantId, isActive: true } }),
      prisma.plantTrainingTopic.findMany({ where: { plantId }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      records: records.map(row => ({ id: row.id, topicId: row.topicId, topicName: row.topic.name, occurredOn: row.occurredOn.toISOString().slice(0, 10), category: row.category, durationMinutes: row.durationMinutes, traineeName: row.traineeName, attendees: row.attendees.length ? row.attendees : [{ employeeId: row.traineeId, name: row.traineeName }], trainers: [...row.trainers.map(trainer => trainer.name), ...(row.manualTrainerName ? [row.manualTrainerName] : [])], trainerId: row.trainers[0]?.employeeId ?? null, manualTrainerName: row.manualTrainerName })) satisfies PlantTrainingRow[],
      metricRows: metricRows.map(row => ({ ...row, occurredOn: row.occurredOn.toISOString().slice(0, 10) })) satisfies TrainingMetricRow[],
      workerCount,
      topics,
    };
  },

  async create(plantId: string, input: CreatePlantTrainingInput, actorUserId: string) {
    return prisma.$transaction(async tx => {
      const topic = await tx.plantTrainingTopic.findFirst({ where: { id: input.topicId, plantId, isActive: true } });
      if (!topic) throw new PlantTrainingError("TRAINING_TOPIC_UNAVAILABLE");
      const workerIds = [...new Set([...input.traineeIds, ...(input.trainerId ? [input.trainerId] : [])])];
      const workers = await tx.employeeDirectory.findMany({ where: { id: { in: workerIds }, plantId, isActive: true }, select: { id: true, name: true } });
      if (workers.length !== workerIds.length) throw new PlantTrainingError("TRAINING_WORKER_UNAVAILABLE");
      const names = new Map(workers.map(worker => [worker.id, worker.name]));
      const firstTraineeId = input.traineeIds[0] ?? null;
      const attendeeNames = [
        ...input.traineeIds.map(employeeId => names.get(employeeId)!),
        ...input.traineeNames.map(name => name.trim()),
      ];
      const firstTraineeName = attendeeNames[0]!;
      const record = await tx.plantTrainingRecord.create({ data: {
        plantId,
        topicId: topic.id,
        occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
        category: input.category,
        durationMinutes: durationToMinutes(input.duration),
        traineeId: input.traineeIds[0] ?? null,
        traineeName: attendeeNames.join(", "),
        manualTrainerName: input.trainerName?.trim() ?? null,
        createdByUserId: actorUserId,
        trainers: { create: input.trainerId ? [{ employeeId: input.trainerId, name: names.get(input.trainerId)! }] : [] },
        attendees: { create: [
          ...input.traineeIds.map(employeeId => ({ employeeId, name: names.get(employeeId)! })),
          ...input.traineeNames.map(name => ({ name: name.trim() })),
        ] },
      }, include: { attendees: true } });
      for (const attendee of record.attendees) {
        if (!attendee.employeeId) continue;
        await CompetenceService.registerPlantTrainingAttendee(tx, {
          plantId,
          employeeDirectoryId: attendee.employeeId,
          topicName: topic.name,
          completedAt: record.occurredOn,
          durationMinutes: record.durationMinutes,
          trainerName: input.trainerName?.trim() ?? names.get(input.trainerId!)!,
          actorUserId,
        });
      }
      await writeAuditLog({ entityType: "PlantTrainingRecord", entityId: record.id, action: "CREATE", actorUserId, plantId, diff: buildDiff(null, { ...record, traineeIds: input.traineeIds, traineeNames: input.traineeNames, trainerId: input.trainerId ?? null, trainerName: input.trainerName?.trim() ?? null }) }, tx);
      return record;
    });
  },

  async update(plantId: string, id: string, input: CreatePlantTrainingInput, actorUserId: string) {
    return prisma.$transaction(async tx => {
      const before = await tx.plantTrainingRecord.findFirst({ where: { id, plantId }, include: { attendees: true, trainers: true } });
      if (!before) throw new PlantTrainingError("TRAINING_RECORD_NOT_FOUND", 404);
      const topic = await tx.plantTrainingTopic.findFirst({ where: { id: input.topicId, plantId, OR: [{ isActive: true }, { id: before.topicId }] } });
      if (!topic) throw new PlantTrainingError("TRAINING_TOPIC_UNAVAILABLE");
      const workerIds = [...new Set([...input.traineeIds, ...(input.trainerId ? [input.trainerId] : [])])];
      const workers = await tx.employeeDirectory.findMany({ where: { id: { in: workerIds }, plantId, isActive: true }, select: { id: true, name: true } });
      if (workers.length !== workerIds.length) throw new PlantTrainingError("TRAINING_WORKER_UNAVAILABLE");
      const names = new Map(workers.map(worker => [worker.id, worker.name]));
      const attendeeNames = [...input.traineeIds.map(employeeId => names.get(employeeId)!), ...input.traineeNames.map(name => name.trim())];
      await tx.plantTrainingAttendee.deleteMany({ where: { recordId: id } });
      await tx.plantTrainingTrainer.deleteMany({ where: { recordId: id } });
      const record = await tx.plantTrainingRecord.update({
        where: { id },
        data: {
          topicId: topic.id,
          occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
          category: input.category,
          durationMinutes: durationToMinutes(input.duration),
          traineeId: input.traineeIds[0] ?? null,
          traineeName: attendeeNames.join(", "),
          manualTrainerName: input.trainerName?.trim() ?? null,
          trainers: { create: input.trainerId ? [{ employeeId: input.trainerId, name: names.get(input.trainerId)! }] : [] },
          attendees: { create: [
            ...input.traineeIds.map(employeeId => ({ employeeId, name: names.get(employeeId)! })),
            ...input.traineeNames.map(name => ({ name: name.trim() })),
          ] },
        },
      });
      await writeAuditLog({ entityType: "PlantTrainingRecord", entityId: id, action: "UPDATE", actorUserId, plantId, diff: buildDiff(before, { ...record, traineeIds: input.traineeIds, traineeNames: input.traineeNames, trainerId: input.trainerId ?? null, trainerName: input.trainerName?.trim() ?? null }) }, tx);
      return record;
    });
  },

  async delete(plantId: string, id: string, actorUserId: string) {
    return prisma.$transaction(async tx => {
      const before = await tx.plantTrainingRecord.findFirst({ where: { id, plantId }, include: { attendees: true, trainers: true } });
      if (!before) throw new PlantTrainingError("TRAINING_RECORD_NOT_FOUND", 404);
      await tx.plantTrainingRecord.delete({ where: { id } });
      await writeAuditLog({ entityType: "PlantTrainingRecord", entityId: id, action: "DELETE", actorUserId, plantId, diff: buildDiff(before, null) }, tx);
      return { id };
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
