/*
  Convert every active, mandatory legacy rule before removing its source
  table.  This migration must remain self-contained: `migrate deploy` cannot
  pause between migrations to run a TypeScript backfill command.

  A worker/type pair can match more than one rule, hence the DISTINCT and the
  unique-index conflict guard.  The original author/date are retained where
  available so the per-worker audit trail starts with useful provenance.
*/
INSERT INTO "CompetenceWorkerRequirement" (
  "id",
  "plantId",
  "competenceWorkerId",
  "competenceTypeId",
  "isRequired",
  "setById",
  "setAt",
  "updatedAt"
)
SELECT DISTINCT ON (cw."id", cr."competenceTypeId")
  md5(random()::text || clock_timestamp()::text || cw."id" || cr."id"),
  cw."plantId",
  cw."id",
  cr."competenceTypeId",
  true,
  cr."createdById",
  cr."createdAt",
  cr."createdAt"
FROM "CompetenceRequirement" cr
JOIN "CompetenceWorker" cw
  ON cw."plantId" = cr."plantId"
  AND cw."isActive" = true
JOIN "EmployeeDirectory" ed ON ed."id" = cw."employeeDirectoryId"
LEFT JOIN "Area" scope_area ON scope_area."id" = cr."scopeAreaId"
LEFT JOIN "OccupationalHealthWorker" ohw
  ON ohw."plantId" = cw."plantId"
  AND ohw."employeeNo" = ed."employeeNo"
WHERE cr."isActive" = true
  AND cr."isMandatory" = true
  AND (
    cr."scopeType" = 'ALL_WORKERS'
    OR (cr."scopeType" = 'ROLE' AND cr."scopeRoleName" IS NOT NULL
      AND cw."roleName" IS NOT NULL
      AND lower(trim(cw."roleName")) = lower(trim(cr."scopeRoleName")))
    OR (cr."scopeType" = 'AREA' AND cr."scopeAreaId" IS NOT NULL
      AND (cw."areaId" = cr."scopeAreaId"
        OR (cw."areaId" IS NULL AND ed."dept" IS NOT NULL
          AND lower(trim(ed."dept")) = lower(trim(scope_area."name")))))
    OR (cr."scopeType" = 'WORKSTATION' AND cr."scopeWorkstationId" IS NOT NULL
      AND ohw."workstationId" = cr."scopeWorkstationId")
  )
ON CONFLICT ("competenceWorkerId", "competenceTypeId") DO NOTHING;

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_competenceTypeId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_plantId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_scopeAreaId_fkey";

-- DropForeignKey
ALTER TABLE "CompetenceRequirement" DROP CONSTRAINT "CompetenceRequirement_scopeWorkstationId_fkey";

-- DropTable
DROP TABLE "CompetenceRequirement";

-- DropEnum
DROP TYPE "CompetenceRequirementScope";
