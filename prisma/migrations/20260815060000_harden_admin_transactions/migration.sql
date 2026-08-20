-- This migration is intentionally amended before deployment. It upgrades the
-- original pre-hardening relation data directly to temporal, inclusive ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Repair malformed legacy intervals before installing the invariant.
UPDATE "UserTraineeRelation"
SET "endDate" = "startDate", "updatedAt" = CURRENT_TIMESTAMP
WHERE "endDate" IS NOT NULL AND "endDate" < "startDate";

-- Exact-start duplicates cannot both describe a schedule. Prefer the row that
-- is effective on migration day, then a future row, then an expired row; break
-- ties deterministically by the latest creation/id.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "traineeId", "type", "startDate"
           ORDER BY
             CASE
               WHEN "startDate" <= CURRENT_DATE AND ("endDate" IS NULL OR "endDate" >= CURRENT_DATE) THEN 0
               WHEN "startDate" > CURRENT_DATE THEN 1
               ELSE 2
             END,
             "createdAt" DESC,
             "id" DESC
         ) AS position
  FROM "UserTraineeRelation"
  WHERE "enabled" = true
)
UPDATE "UserTraineeRelation" AS relation
SET "enabled" = false,
    "endDate" = COALESCE(relation."endDate", GREATEST(relation."startDate", CURRENT_DATE)),
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE relation."id" = ranked."id" AND ranked.position > 1;

-- An expired row that starts inside the currently effective row is stale
-- conflicting data, not a replacement that should cut current access short.
WITH current_rows AS (
  SELECT "id", "traineeId", "type", "startDate", "endDate"
  FROM "UserTraineeRelation"
  WHERE "enabled" = true
    AND "startDate" <= CURRENT_DATE
    AND ("endDate" IS NULL OR "endDate" >= CURRENT_DATE)
), stale_expired AS (
  SELECT DISTINCT expired."id"
  FROM "UserTraineeRelation" AS expired
  JOIN current_rows AS current_relation
    ON current_relation."traineeId" = expired."traineeId"
   AND current_relation."type" = expired."type"
   AND current_relation."id" <> expired."id"
  WHERE expired."enabled" = true
    AND expired."endDate" < CURRENT_DATE
    AND expired."startDate" >= current_relation."startDate"
    AND expired."endDate" >= current_relation."startDate"
)
UPDATE "UserTraineeRelation" AS relation
SET "enabled" = false,
    "endDate" = COALESCE(relation."endDate", relation."startDate"),
    "updatedAt" = CURRENT_TIMESTAMP
FROM stale_expired
WHERE relation."id" = stale_expired."id";

-- Retain every remaining history/current/future row while closing each
-- overlapping predecessor on the inclusive day before its successor.
WITH ordered AS (
  SELECT "id",
         lead("startDate") OVER (
           PARTITION BY "traineeId", "type"
           ORDER BY "startDate", "createdAt", "id"
         ) AS next_start
  FROM "UserTraineeRelation"
  WHERE "enabled" = true
)
UPDATE "UserTraineeRelation" AS relation
SET "endDate" = ordered.next_start - 1,
    "updatedAt" = CURRENT_TIMESTAMP
FROM ordered
WHERE relation."id" = ordered."id"
  AND ordered.next_start IS NOT NULL
  AND (relation."endDate" IS NULL OR relation."endDate" >= ordered.next_start);

-- Disabled rows are cancellations/history, never open-ended active-looking rows.
UPDATE "UserTraineeRelation"
SET "endDate" = COALESCE("endDate", GREATEST("startDate", CURRENT_DATE)),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "enabled" = false;

ALTER TABLE "UserTraineeRelation"
  ADD CONSTRAINT "UserTraineeRelation_valid_inclusive_dates"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

ALTER TABLE "UserTraineeRelation"
  ADD CONSTRAINT "UserTraineeRelation_enabled_no_overlap"
  EXCLUDE USING gist (
    "traineeId" WITH =,
    "type" WITH =,
    daterange("startDate", COALESCE("endDate", 'infinity'::date), '[]') WITH &&
  ) WHERE ("enabled" = true);

CREATE INDEX "UserTraineeRelation_traineeId_type_enabled_idx"
ON "UserTraineeRelation" ("traineeId", "type", "enabled");

ALTER TABLE "ImportBatch" ADD COLUMN "nonceHash" TEXT;
CREATE UNIQUE INDEX "ImportBatch_nonceHash_key" ON "ImportBatch"("nonceHash");
