-- N1_CORPORATE is a global role. Collapse existing per-plant N1 rows into
-- one plant-independent UserPlantRole per user.
WITH n1_role AS (
  SELECT id
  FROM "Role"
  WHERE code = 'N1_CORPORATE'
),
ranked_n1 AS (
  SELECT
    upr.id,
    row_number() OVER (PARTITION BY upr."userId" ORDER BY upr."createdAt", upr.id) AS rn
  FROM "UserPlantRole" upr
  JOIN n1_role ON n1_role.id = upr."roleId"
)
DELETE FROM "UserPlantRole"
WHERE id IN (
  SELECT id
  FROM ranked_n1
  WHERE rn > 1
);

UPDATE "UserPlantRole"
SET "plantId" = NULL
WHERE "roleId" IN (
  SELECT id
  FROM "Role"
  WHERE code = 'N1_CORPORATE'
);

-- N6_QR_REPORTER is no longer a user role. Public submissions are represented
-- by PlantAccessTokenType and CommunicationSource instead.
DELETE FROM "UserPlantRole"
WHERE "roleId" IN (
  SELECT id
  FROM "Role"
  WHERE code = 'N6_QR_REPORTER'
);

DELETE FROM "Role"
WHERE code = 'N6_QR_REPORTER';

CREATE UNIQUE INDEX IF NOT EXISTS "UserPlantRole_userId_roleId_global_key"
ON "UserPlantRole"("userId", "roleId")
WHERE "plantId" IS NULL;

ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
CREATE TYPE "RoleCode" AS ENUM (
  'N0_ADMIN',
  'N1_CORPORATE',
  'N2_PLANT_MANAGER',
  'N3_SAFETY',
  'N4_SUPERVISOR',
  'N5_OPERATOR',
  'MEDICO'
);

ALTER TABLE "Role"
ALTER COLUMN "code" TYPE "RoleCode"
USING ("code"::text::"RoleCode");

CREATE OR REPLACE FUNCTION check_n0_no_plant()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Role" r
    WHERE r."id" = NEW."roleId"
    AND r."code" IN ('N0_ADMIN', 'N1_CORPORATE')
    AND NEW."plantId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Global roles cannot be associated with a plant/factory'
      USING HINT = 'N0 and N1 users must have plantId = NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Role" r
    WHERE r."id" = NEW."roleId"
    AND r."code" NOT IN ('N0_ADMIN', 'N1_CORPORATE')
    AND NEW."plantId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Plant-scoped roles must be associated with a plant/factory'
      USING HINT = 'N2, N3, N4, N5 and MEDICO users must have a plantId';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TYPE "RoleCode_old";
