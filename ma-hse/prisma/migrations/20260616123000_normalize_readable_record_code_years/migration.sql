-- Normalize readable record codes that were backfilled from legacy records with invalid years.
-- When the source occurrence date is invalid, use the record creation year and allocate the next
-- available sequence for the same entity/type/factory/year.

WITH invalid_rows AS (
  SELECT
    c."id",
    c."tipo",
    c."codigoFabrica",
    EXTRACT(YEAR FROM c."createdAt")::INT AS "targetAno"
  FROM "Communication" c
  WHERE c."tipo" IS NOT NULL
    AND c."codigoFabrica" IS NOT NULL
    AND c."ano" IS NOT NULL
    AND (c."ano" < 2000 OR c."ano" > 9999)
),
base AS (
  SELECT
    invalid_rows."tipo",
    invalid_rows."codigoFabrica",
    invalid_rows."targetAno",
    GREATEST(
      COALESCE((
        SELECT MAX(c."numeroSequencial")
        FROM "Communication" c
        WHERE c."tipo" = invalid_rows."tipo"
          AND c."codigoFabrica" = invalid_rows."codigoFabrica"
          AND c."ano" = invalid_rows."targetAno"
      ), 0),
      COALESCE((
        SELECT MAX(s."currentValue")
        FROM "RecordCodeSequence" s
        WHERE s."entityType" = 'COMMUNICATION'
          AND s."tipo" = invalid_rows."tipo"
          AND s."codigoFabrica" = invalid_rows."codigoFabrica"
          AND s."ano" = invalid_rows."targetAno"
      ), 0)
    ) AS "baseSeq"
  FROM invalid_rows
  GROUP BY invalid_rows."tipo", invalid_rows."codigoFabrica", invalid_rows."targetAno"
),
renumbered AS (
  SELECT
    invalid_rows."id",
    invalid_rows."tipo",
    invalid_rows."codigoFabrica",
    invalid_rows."targetAno",
    base."baseSeq" + ROW_NUMBER() OVER (
      PARTITION BY invalid_rows."tipo", invalid_rows."codigoFabrica", invalid_rows."targetAno"
      ORDER BY invalid_rows."id"
    ) AS "newSeq"
  FROM invalid_rows
  JOIN base
    ON base."tipo" = invalid_rows."tipo"
   AND base."codigoFabrica" = invalid_rows."codigoFabrica"
   AND base."targetAno" = invalid_rows."targetAno"
)
UPDATE "Communication" c
SET
  "ano" = renumbered."targetAno",
  "numeroSequencial" = renumbered."newSeq",
  "codigoCompleto" = renumbered."tipo" || '_' || renumbered."codigoFabrica" || '_' || renumbered."targetAno" || '_' || LPAD(renumbered."newSeq"::TEXT, 2, '0'),
  "codigoAbreviado" = '#' || renumbered."targetAno" || LPAD(renumbered."newSeq"::TEXT, 2, '0')
FROM renumbered
WHERE c."id" = renumbered."id";

WITH max_rows AS (
  SELECT "tipo", "codigoFabrica", "ano", MAX("numeroSequencial") AS "currentValue"
  FROM "Communication"
  WHERE "tipo" IS NOT NULL AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
  GROUP BY "tipo", "codigoFabrica", "ano"
)
INSERT INTO "RecordCodeSequence" ("id", "entityType", "tipo", "codigoFabrica", "ano", "currentValue", "updatedAt")
SELECT md5('COMMUNICATION:' || "tipo" || ':' || "codigoFabrica" || ':' || "ano"), 'COMMUNICATION', "tipo", "codigoFabrica", "ano", "currentValue", NOW()
FROM max_rows
ON CONFLICT ("entityType", "tipo", "codigoFabrica", "ano")
DO UPDATE SET "currentValue" = GREATEST("RecordCodeSequence"."currentValue", EXCLUDED."currentValue"), "updatedAt" = NOW();

DELETE FROM "RecordCodeSequence" s
WHERE s."ano" IS NOT NULL
  AND (s."ano" < 2000 OR s."ano" > 9999)
  AND NOT EXISTS (
    SELECT 1 FROM "Communication" c
    WHERE s."entityType" = 'COMMUNICATION'
      AND c."tipo" = s."tipo"
      AND c."codigoFabrica" = s."codigoFabrica"
      AND c."ano" = s."ano"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "SEWO" sewo
    WHERE s."entityType" = 'SEWO'
      AND sewo."tipo" = s."tipo"
      AND sewo."codigoFabrica" = s."codigoFabrica"
      AND sewo."ano" = s."ano"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ReportRun" r
    WHERE s."entityType" = 'REPORT'
      AND r."tipo" = s."tipo"
      AND r."codigoFabrica" = s."codigoFabrica"
      AND r."ano" = s."ano"
  );
