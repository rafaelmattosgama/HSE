-- Persist readable sequential codes while keeping UUID primary keys for relations/routes.

CREATE TABLE "RecordCodeSequence" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "codigoFabrica" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecordCodeSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordCodeSequence_entityType_tipo_codigoFabrica_ano_key"
  ON "RecordCodeSequence"("entityType", "tipo", "codigoFabrica", "ano");

CREATE INDEX "RecordCodeSequence_entityType_codigoFabrica_ano_idx"
  ON "RecordCodeSequence"("entityType", "codigoFabrica", "ano");

ALTER TABLE "Communication"
  ADD COLUMN "codigoCompleto" TEXT,
  ADD COLUMN "codigoAbreviado" TEXT,
  ADD COLUMN "tipo" TEXT,
  ADD COLUMN "codigoFabrica" TEXT,
  ADD COLUMN "ano" INTEGER,
  ADD COLUMN "numeroSequencial" INTEGER;

CREATE UNIQUE INDEX "Communication_codigoCompleto_key" ON "Communication"("codigoCompleto");
CREATE INDEX "Communication_tipo_codigoFabrica_ano_numeroSequencial_idx"
  ON "Communication"("tipo", "codigoFabrica", "ano", "numeroSequencial");

ALTER TABLE "SEWO"
  ADD COLUMN "codigoSewo" TEXT,
  ADD COLUMN "tipo" TEXT,
  ADD COLUMN "codigoFabrica" TEXT,
  ADD COLUMN "ano" INTEGER,
  ADD COLUMN "numeroSequencial" INTEGER;

CREATE UNIQUE INDEX "SEWO_codigoSewo_key" ON "SEWO"("codigoSewo");
CREATE INDEX "SEWO_tipo_codigoFabrica_ano_numeroSequencial_idx"
  ON "SEWO"("tipo", "codigoFabrica", "ano", "numeroSequencial");

ALTER TABLE "ReportRun"
  ADD COLUMN "codigoCompleto" TEXT,
  ADD COLUMN "codigoAbreviado" TEXT,
  ADD COLUMN "tipo" TEXT,
  ADD COLUMN "codigoFabrica" TEXT,
  ADD COLUMN "ano" INTEGER,
  ADD COLUMN "numeroSequencial" INTEGER;

CREATE UNIQUE INDEX "ReportRun_codigoCompleto_key" ON "ReportRun"("codigoCompleto");
CREATE INDEX "ReportRun_tipo_codigoFabrica_ano_numeroSequencial_idx"
  ON "ReportRun"("tipo", "codigoFabrica", "ano", "numeroSequencial");

WITH communication_source AS (
  SELECT
    c.id,
    CASE c.type
      WHEN 'UNSAFE_ACT' THEN 'UA'
      WHEN 'UNSAFE_CONDITION' THEN 'UC'
      WHEN 'NEAR_MISS' THEN 'NM'
      WHEN 'FIRST_AID' THEN 'FA'
      WHEN 'ACCIDENT' THEN 'IN'
      ELSE NULL
    END AS tipo,
    COALESCE(NULLIF(UPPER(REGEXP_REPLACE(p.code, '[^A-Za-z0-9]+', '', 'g')), ''), 'PLANT') AS "codigoFabrica",
    EXTRACT(YEAR FROM c."eventDatetime")::INTEGER AS ano,
    ROW_NUMBER() OVER (
      PARTITION BY
        c.type,
        COALESCE(NULLIF(UPPER(REGEXP_REPLACE(p.code, '[^A-Za-z0-9]+', '', 'g')), ''), 'PLANT'),
        EXTRACT(YEAR FROM c."eventDatetime")::INTEGER
      ORDER BY c."eventDatetime", c."createdAt", c.id
    )::INTEGER AS seq
  FROM "Communication" c
  INNER JOIN "Plant" p ON p.id = c."plantId"
  WHERE c.type IN ('UNSAFE_ACT', 'UNSAFE_CONDITION', 'NEAR_MISS', 'FIRST_AID', 'ACCIDENT')
)
UPDATE "Communication" c
SET
  "tipo" = source.tipo,
  "codigoFabrica" = source."codigoFabrica",
  "ano" = source.ano,
  "numeroSequencial" = source.seq,
  "codigoCompleto" = source.tipo || '_' || source."codigoFabrica" || '_' || source.ano || '_' || LPAD(source.seq::TEXT, 2, '0'),
  "codigoAbreviado" = '#' || source.ano || LPAD(source.seq::TEXT, 2, '0')
FROM communication_source source
WHERE c.id = source.id
  AND c."codigoCompleto" IS NULL;

WITH sewo_source AS (
  SELECT
    s.id,
    CASE c.type
      WHEN 'UNSAFE_ACT' THEN 'UA'
      WHEN 'UNSAFE_CONDITION' THEN 'UC'
      WHEN 'NEAR_MISS' THEN 'NM'
      WHEN 'FIRST_AID' THEN 'FA'
      WHEN 'ACCIDENT' THEN 'IN'
      ELSE NULL
    END AS tipo,
    COALESCE(NULLIF(UPPER(REGEXP_REPLACE(p.code, '[^A-Za-z0-9]+', '', 'g')), ''), 'PLANT') AS "codigoFabrica",
    EXTRACT(YEAR FROM s."analysisDate")::INTEGER AS ano,
    ROW_NUMBER() OVER (
      PARTITION BY
        c.type,
        COALESCE(NULLIF(UPPER(REGEXP_REPLACE(p.code, '[^A-Za-z0-9]+', '', 'g')), ''), 'PLANT'),
        EXTRACT(YEAR FROM s."analysisDate")::INTEGER
      ORDER BY s."analysisDate", s."createdAt", s.id
    )::INTEGER AS seq
  FROM "SEWO" s
  INNER JOIN "Plant" p ON p.id = s."plantId"
  LEFT JOIN "Communication" c ON c.id = s."communicationId"
  WHERE c.type IN ('UNSAFE_ACT', 'UNSAFE_CONDITION', 'NEAR_MISS', 'FIRST_AID', 'ACCIDENT')
)
UPDATE "SEWO" s
SET
  "tipo" = source.tipo,
  "codigoFabrica" = source."codigoFabrica",
  "ano" = source.ano,
  "numeroSequencial" = source.seq,
  "codigoSewo" = 'sewo_' || source."codigoFabrica" || source.tipo || source.ano || LPAD(source.seq::TEXT, 2, '0')
FROM sewo_source source
WHERE s.id = source.id
  AND s."codigoSewo" IS NULL;

WITH report_source AS (
  SELECT
    r.id,
    'IN' AS tipo,
    COALESCE(NULLIF(UPPER(REGEXP_REPLACE(COALESCE(p.code, 'GLOBAL'), '[^A-Za-z0-9]+', '', 'g')), ''), 'GLOBAL') AS "codigoFabrica",
    EXTRACT(YEAR FROM r."periodStart")::INTEGER AS ano,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(NULLIF(UPPER(REGEXP_REPLACE(COALESCE(p.code, 'GLOBAL'), '[^A-Za-z0-9]+', '', 'g')), ''), 'GLOBAL'),
        EXTRACT(YEAR FROM r."periodStart")::INTEGER
      ORDER BY r."periodStart", r."createdAt", r.id
    )::INTEGER AS seq
  FROM "ReportRun" r
  LEFT JOIN "Plant" p ON p.id = r."plantId"
)
UPDATE "ReportRun" r
SET
  "tipo" = source.tipo,
  "codigoFabrica" = source."codigoFabrica",
  "ano" = source.ano,
  "numeroSequencial" = source.seq,
  "codigoCompleto" = source.tipo || '_' || source."codigoFabrica" || '_' || source.ano || '_' || LPAD(source.seq::TEXT, 2, '0'),
  "codigoAbreviado" = '#' || source.ano || LPAD(source.seq::TEXT, 2, '0')
FROM report_source source
WHERE r.id = source.id
  AND r."codigoCompleto" IS NULL;

INSERT INTO "RecordCodeSequence" ("id", "entityType", "tipo", "codigoFabrica", "ano", "currentValue", "updatedAt")
SELECT md5('COMMUNICATION:' || "tipo" || ':' || "codigoFabrica" || ':' || "ano"), 'COMMUNICATION', "tipo", "codigoFabrica", "ano", MAX("numeroSequencial"), NOW()
FROM "Communication"
WHERE "tipo" IS NOT NULL AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
GROUP BY "tipo", "codigoFabrica", "ano";

INSERT INTO "RecordCodeSequence" ("id", "entityType", "tipo", "codigoFabrica", "ano", "currentValue", "updatedAt")
SELECT md5('SEWO:' || "tipo" || ':' || "codigoFabrica" || ':' || "ano"), 'SEWO', "tipo", "codigoFabrica", "ano", MAX("numeroSequencial"), NOW()
FROM "SEWO"
WHERE "tipo" IS NOT NULL AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
GROUP BY "tipo", "codigoFabrica", "ano";

INSERT INTO "RecordCodeSequence" ("id", "entityType", "tipo", "codigoFabrica", "ano", "currentValue", "updatedAt")
SELECT md5('REPORT:' || "tipo" || ':' || "codigoFabrica" || ':' || "ano"), 'REPORT', "tipo", "codigoFabrica", "ano", MAX("numeroSequencial"), NOW()
FROM "ReportRun"
WHERE "tipo" IS NOT NULL AND "codigoFabrica" IS NOT NULL AND "ano" IS NOT NULL AND "numeroSequencial" IS NOT NULL
GROUP BY "tipo", "codigoFabrica", "ano";
