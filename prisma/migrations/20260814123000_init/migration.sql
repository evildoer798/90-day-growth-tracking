-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'SUPERVISOR', 'MENTOR', 'TRAINEE');

-- CreateEnum
CREATE TYPE "FocusGroup" AS ENUM ('D1', 'D2', 'D3', 'D4');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('MENTOR', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "TaskDimension" AS ENUM ('D1', 'D2', 'D3', 'D4', 'Dall');

-- CreateEnum
CREATE TYPE "ConfirmationKind" AS ENUM ('ACTION_CONFIRMED', 'ACTION_UNCONFIRMED', 'DRILL_CONFIRMED', 'DRILL_UNCONFIRMED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'CONFIRM', 'UNCONFIRM', 'IMPORT', 'EXPORT', 'LOGIN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PREVIEWED', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "traineeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Trainee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "focusGroup" "FocusGroup" NOT NULL,
    "trainingStartDate" DATE NOT NULL,
    "trainingDayOverride" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trainee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTraineeRelation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTraineeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingTask" (
    "id" TEXT NOT NULL,
    "stableImportKey" TEXT NOT NULL,
    "milestone" TEXT,
    "day" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "dimension" "TaskDimension" NOT NULL,
    "dimensionName" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "action" TEXT,
    "drill" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskReference" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TaskReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskProgress" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "learnDone" BOOLEAN NOT NULL DEFAULT false,
    "learnAt" TIMESTAMP(3),
    "actionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "actionConfirmedAt" TIMESTAMP(3),
    "actionConfirmedById" TEXT,
    "drillConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "drillConfirmedAt" TIMESTAMP(3),
    "drillConfirmedById" TEXT,
    "feedback" TEXT,
    "traineeNote" TEXT,
    "mentorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationEvent" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "ConfirmationKind" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskVersion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "actorId" TEXT NOT NULL,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "preview" JSONB,
    "result" JSONB,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_traineeId_key" ON "User"("traineeId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Trainee_employeeId_key" ON "Trainee"("employeeId");

-- CreateIndex
CREATE INDEX "Trainee_employeeId_enabled_idx" ON "Trainee"("employeeId", "enabled");

-- CreateIndex
CREATE INDEX "UserTraineeRelation_userId_enabled_type_idx" ON "UserTraineeRelation"("userId", "enabled", "type");

-- CreateIndex
CREATE INDEX "UserTraineeRelation_traineeId_enabled_type_idx" ON "UserTraineeRelation"("traineeId", "enabled", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTask_stableImportKey_key" ON "TrainingTask"("stableImportKey");

-- CreateIndex
CREATE INDEX "TrainingTask_day_stage_dimension_idx" ON "TrainingTask"("day", "stage", "dimension");

-- CreateIndex
CREATE INDEX "TrainingTask_enabled_sortOrder_idx" ON "TrainingTask"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskReference_taskId_sortOrder_idx" ON "TaskReference"("taskId", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskProgress_taskId_idx" ON "TaskProgress"("taskId");

-- CreateIndex
CREATE INDEX "TaskProgress_actionConfirmedById_idx" ON "TaskProgress"("actionConfirmedById");

-- CreateIndex
CREATE INDEX "TaskProgress_drillConfirmedById_idx" ON "TaskProgress"("drillConfirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "TaskProgress_traineeId_taskId_key" ON "TaskProgress"("traineeId", "taskId");

-- CreateIndex
CREATE INDEX "ConfirmationEvent_traineeId_taskId_createdAt_idx" ON "ConfirmationEvent"("traineeId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ConfirmationEvent_actorId_idx" ON "ConfirmationEvent"("actorId");

-- CreateIndex
CREATE INDEX "TaskVersion_taskId_createdAt_idx" ON "TaskVersion"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskVersion_actorId_idx" ON "TaskVersion"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "ImportBatch_checksum_idx" ON "ImportBatch"("checksum");

-- CreateIndex
CREATE INDEX "ImportBatch_operatorId_createdAt_idx" ON "ImportBatch"("operatorId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraineeRelation" ADD CONSTRAINT "UserTraineeRelation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTraineeRelation" ADD CONSTRAINT "UserTraineeRelation_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReference" ADD CONSTRAINT "TaskReference_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrainingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrainingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_actionConfirmedById_fkey" FOREIGN KEY ("actionConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_drillConfirmedById_fkey" FOREIGN KEY ("drillConfirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationEvent" ADD CONSTRAINT "ConfirmationEvent_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationEvent" ADD CONSTRAINT "ConfirmationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrainingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationEvent" ADD CONSTRAINT "ConfirmationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrainingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskVersion" ADD CONSTRAINT "TaskVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
