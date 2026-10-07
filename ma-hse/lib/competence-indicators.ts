import type { CompetenceMatrixView } from "@/lib/services/competence-service";

export function getCompetenceIndicators(matrix: CompetenceMatrixView) {
    let expired = 0;
    let expiring30 = 0;
    let expiring60 = 0;
    let expiring90 = 0;
    let awaitingAssessment = 0;
    let awaitingAuthorization = 0;
    let criticalGaps = 0;
    const coverageByType = new Map<string, { required: number; authorized: number }>();
    matrix.competenceTypes.forEach((type) => coverageByType.set(type.id, { required: 0, authorized: 0 }));

    matrix.workers.forEach((worker) => {
      worker.cells.forEach((cell) => {
        if (cell.state === "EXPIRED") expired += 1;
        if (cell.state === "EXPIRING" && cell.daysToExpiry != null) {
          if (cell.daysToExpiry <= 30) expiring30 += 1;
          else if (cell.daysToExpiry <= 60) expiring60 += 1;
          else expiring90 += 1;
        }
        if (cell.state === "AWAITING_ASSESSMENT") awaitingAssessment += 1;
        if (cell.state === "AWAITING_AUTHORIZATION") awaitingAuthorization += 1;
        if (cell.isRequired && cell.state === "MISSING") criticalGaps += 1;

        const bucket = coverageByType.get(cell.competenceTypeId);
        if (bucket && cell.isRequired) {
          bucket.required += 1;
          if (cell.state === "VALID" || cell.state === "EXPIRING") bucket.authorized += 1;
        }
      });
    });

    const coverage = matrix.competenceTypes.map((type) => {
      const bucket = coverageByType.get(type.id) ?? { required: 0, authorized: 0 };
      const percentage = bucket.required > 0 ? Math.round((bucket.authorized / bucket.required) * 100) : null;
      return { typeId: type.id, name: type.name, percentage, required: bucket.required, authorized: bucket.authorized };
    });

    return { expired, expiring30, expiring60, expiring90, awaitingAssessment, awaitingAuthorization, criticalGaps, coverage };
}
