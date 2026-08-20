ALTER TABLE "TaskProgress"
ADD COLUMN "actionSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "actionSubmittedAt" TIMESTAMP(3),
ADD COLUMN "drillSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "drillSubmittedAt" TIMESTAMP(3);

UPDATE "TaskProgress"
SET
  "actionSubmitted" = "actionConfirmed",
  "actionSubmittedAt" = CASE
    WHEN "actionConfirmed" THEN COALESCE("actionConfirmedAt", "updatedAt")
    ELSE NULL
  END,
  "drillSubmitted" = "drillConfirmed",
  "drillSubmittedAt" = CASE
    WHEN "drillConfirmed" THEN COALESCE("drillConfirmedAt", "updatedAt")
    ELSE NULL
  END;

ALTER TABLE "TaskProgress"
ADD CONSTRAINT "TaskProgress_action_confirmation_requires_submission"
CHECK (NOT "actionConfirmed" OR "actionSubmitted"),
ADD CONSTRAINT "TaskProgress_drill_confirmation_requires_submission"
CHECK (NOT "drillConfirmed" OR "drillSubmitted");
