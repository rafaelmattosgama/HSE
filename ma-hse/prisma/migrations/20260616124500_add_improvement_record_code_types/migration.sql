-- Add readable codes for 5S improvements and improvement suggestions.

WITH candidates AS (
  SELECT
    c."id",
    CASE
      WHEN c."type" = 'FIVE_S_IMPROVEMENT' THEN '5S'
      WHEN c."type" = 'IMPROVEMENT_SUGGESTION' THEN 'IMP'
    END AS "tipo",
    UPPER(REGEXP_REPLACE(p."code", '[^A-Za-z0-9]+', '', 'g')) AS "codigoFabrica",
    CASE
      WHEN EXTRACT(YEAR FROM c."eventDatetime")::INT BETWEEN 2000 AND 9999 THEN EXTRACT(YEAR FROM c."eventDatetime")::INT
      ELSE EXTRACT(YEAR FROM c."createdAt")::INT
    END AS "ano",
    c."createdAt",
    c."eventDatetime"
  FROM "Communication" c
  JOIN "Plant" p ON p."id" = c."plantId"
  WHERE c."codigoCompleto" IS NULL
    AND c."type" IN ('FIVE_S_IMPROVEMENT', 'IMPROVEMENT_SUGGESTION')
),
base AS (
  SELECT
    candidates."tipo",
    candidates."codigoFabrica",
    candidates."ano",
    GREATEST(
      COALESCE((
        SELECT MAX(c."numeroSequencial")
        FROM "Communication" c
        WHERE c."tipo" = candidates."tipo"
          AND c."codigoFabrica" = candidates."codigoFabrica"
          AND c."ano" = candidates."ano"
      ), 0),
      COALESCE((
        SELECT MAX(s."currentValue")
        FROM "RecordCodeSequence" s
        WHERE s."entityType" = 'COMMUNICATION'
          AND s."tipo" = candidates."tipo"
          AND s."codigoFabrica" = candidates."codigoFabrica"
          AND s."ano" = candidates."ano"
      ), 0)
    ) AS "baseSeq"
  FROM candidates
  GROUP BY candidates."tipo", candidates."codigoFabrica", candidates."ano"
),
renumbered AS (
  SELECT
    candidates."id",
    candidates."tipo",
    candidates."codigoFabrica",
    candidates."ano",
    base."baseSeq" + ROW_NUMBER() OVER (
      PARTITION BY candidates."tipo", candidates."codigoFabrica", candidates."ano"
      ORDER BY candidates."eventDatetime", candidates."createdAt", candidates."id"
    ) AS "seq"
  FROM candidates
  JOIN base
    ON base."tipo" = candidates."tipo"
   AND base."codigoFabrica" = candidates."codigoFabrica"
   AND base."ano" = candidates."ano"
)
UPDATE "Communication" c
SET
  "tipo" = renumbered."tipo",
  "codigoFabrica" = renumbered."codigoFabrica",
  "ano" = renumbered."ano",
  "numeroSequencial" = renumbered."seq",
  "codigoCompleto" = renumbered."tipo" || '_' || renumbered."codigoFabrica" || '_' || renumbered."ano" || '_' || LPAD(renumbered."seq"::TEXT, 2, '0'),
  "codigoAbreviado" = '#' || renumbered."ano" || LPAD(renumbered."seq"::TEXT, 2, '0')
FROM renumbered
WHERE c."id" = renumbered."id";

WITH candidates AS (
  SELECT
    s."id",
    c."tipo",
    c."codigoFabrica",
    CASE
      WHEN EXTRACT(YEAR FROM s."analysisDate")::INT BETWEEN 2000 AND 9999 THEN EXTRACT(YEAR FROM s."analysisDate")::INT
      ELSE EXTRACT(YEAR FROM s."createdAt")::INT
    END AS "ano",
    s."createdAt",
    s."analysisDate"
  FROM "SEWO" s
  JOIN "Communication" c ON c."id" = s."communicationId"
  WHERE s."codigoSewo" IS NULL
    AND c."tipo" IN ('5S', 'IMP')
),
base AS (
  SELECT
    candidates."tipo",
    candidates."codigoFabrica",
    candidates."ano",
    GREATEST(
      COALESCE((
        SELECT MAX(s."numeroSequencial")
        FROM "SEWO" s
        WHERE s."tipo" = candidates."tipo"
          AND s."codigoFabrica" = candidates."codigoFabrica"
          AND s."ano" = candidates."ano"
      ), 0),
      COALESCE((
        SELECT MAX(seq."currentValue")
        FROM "RecordCodeSequence" seq
        WHERE seq."entityType" = 'SEWO'
          AND seq."tipo" = candidates."tipo"
          AND seq."codigoFabrica" = candidates."codigoFabrica"
          AND seq."ano" = candidates."ano"
      ), 0)
    ) AS "baseSeq"
  FROM candidates
  GROUP BY candidates."tipo", candidates."codigoFabrica", candidates."ano"
),
renumbered AS (
  SELECT
    candidates."id",
    candidates."tipo",
    candidates."codigoFabrica",
    candidates."ano",
    base."baseSeq" + ROW_NUMBER() OVER (
      PARTITION BY candidates."tipo", candidates."codigoFabrica", candidates."ano"
      ORDER BY candidates."analysisDate", candidates."createdAt", candidates."id"
    ) AS "seq"
  FROM candidates
  JOIN base
    ON base."tipo" = candidates."tipo"
   AND base."codigoFabrica" = candidates."codigoFabrica"
   AND base."ano" = candidates."ano"
)
UPDATE "SEWO" s
SET
  "tipo" = renumbered."tipo",
  "codigoFabrica" = renumbered."codigoFabrica",
  "ano" = renumbered."ano",
  "numeroSequencial" = renumbered."seq",
  "codigoSewo" = 'sewo_' || renumbered."codigoFabrica" || renumbered."tipo" || renumbered."ano" || LPAD(renumbered."seq"::TEXT, 2, '0')
FROM renumbered
WHERE s."id" = renumbered."id";

WITH max_rows AS (
  SELECT 'COMMUNICATION' AS "entityType", "tipo", "codigoFabrica", "ano", MAX("numeroSequencial") AS "currentValue"
  FROM "Communication"
  WHERE "tipo" IN ('5S', 'IMP') AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
  GROUP BY "tipo", "codigoFabrica", "ano"
  UNION ALL
  SELECT 'SEWO' AS "entityType", "tipo", "codigoFabrica", "ano", MAX("numeroSequencial") AS "currentValue"
  FROM "SEWO"
  WHERE "tipo" IN ('5S', 'IMP') AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
  GROUP BY "tipo", "codigoFabrica", "ano"
)
INSERT INTO "RecordCodeSequence" ("id", "entityType", "tipo", "codigoFabrica", "ano", "currentValue", "updatedAt")
SELECT md5("entityType" || ':' || "tipo" || ':' || "codigoFabrica" || ':' || "ano"), "entityType", "tipo", "codigoFabrica", "ano", "currentValue", NOW()
FROM max_rows
ON CONFLICT ("entityType", "tipo", "codigoFabrica", "ano")
DO UPDATE SET "currentValue" = GREATEST("RecordCodeSequence"."currentValue", EXCLUDED."currentValue"), "updatedAt" = NOW();
