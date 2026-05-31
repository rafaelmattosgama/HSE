CREATE TYPE "RecordLevel" AS ENUM ('N1', 'N2', 'N3', 'N4');

ALTER TABLE "Communication" ADD COLUMN "level" "RecordLevel";
ALTER TABLE "Action" ADD COLUMN "level" "RecordLevel";
