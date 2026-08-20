CREATE TABLE "TrainingPlanSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "durationDays" INTEGER NOT NULL DEFAULT 90,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPlanSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrainingPlanSettings_singleton_id" CHECK ("id" = 'default'),
    CONSTRAINT "TrainingPlanSettings_duration_range" CHECK ("durationDays" BETWEEN 1 AND 365),
    CONSTRAINT "TrainingPlanSettings_nonnegative_revision" CHECK ("revision" >= 0)
);

INSERT INTO "TrainingPlanSettings" ("id", "durationDays", "revision", "updatedAt")
VALUES ('default', 90, 0, CURRENT_TIMESTAMP);
