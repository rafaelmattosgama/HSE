WITH duplicate_n0_roles AS (
  SELECT
    upr."id",
    ROW_NUMBER() OVER (
      PARTITION BY upr."userId", upr."roleId"
      ORDER BY upr."createdAt" ASC, upr."id" ASC
    ) AS row_number
  FROM "UserPlantRole" upr
  INNER JOIN "Role" r ON r."id" = upr."roleId"
  WHERE r."code" = 'N0_ADMIN'
)
DELETE FROM "UserPlantRole" upr
USING duplicate_n0_roles duplicates
WHERE upr."id" = duplicates."id"
  AND duplicates.row_number > 1;

UPDATE "UserPlantRole" upr
SET "plantId" = NULL
FROM "Role" r
WHERE upr."roleId" = r."id"
  AND r."code" = 'N0_ADMIN';

ALTER TABLE "UserPlantRole" DROP CONSTRAINT "UserPlantRole_plantId_fkey";
ALTER TABLE "UserPlantRole" ALTER COLUMN "plantId" DROP NOT NULL;
ALTER TABLE "UserPlantRole" ADD CONSTRAINT "UserPlantRole_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "UserPlantRole_userId_roleId_global_key"
  ON "UserPlantRole"("userId", "roleId")
  WHERE "plantId" IS NULL;
