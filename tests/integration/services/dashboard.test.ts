import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/server/auth/get-actor";
import {
  getMentorDashboard,
  getSupervisorDashboard,
  getTraineeDashboard,
  getTraineeSummaries,
} from "@/server/services/dashboard.service";
import {
  cleanupActualTrainingPlan,
  ensureActualTrainingPlan,
} from "./actual-training-plan.fixture";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testRunId = randomUUID();
const usernamePrefix = `task-7-dashboard-user-${testRunId}`;
const employeePrefix = `task-7-dashboard-trainee-${testRunId}`;

runWithDatabase("dashboard read models", () => {
  let prisma: PrismaClient;
  let supervisor: Actor;
  let mentor: Actor;
  let d2TraineeActor: Actor;
  let d2TraineeId: string;
  let unassignedTraineeId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await ensureActualTrainingPlan(prisma);

    expect(
      await prisma.trainingTask.count({
        where: { stableImportKey: { startsWith: "PLAN_V1-DAY-" }, enabled: true },
      }),
    ).toBe(90);

    const [d2Trainee, unassignedTrainee] = await Promise.all([
      prisma.trainee.create({
        data: {
          name: "Dashboard D2 Trainee",
          employeeId: `${employeePrefix}-d2`,
          focusGroup: "D2",
          trainingStartDate: new Date("2026-07-01T00:00:00.000Z"),
          trainingDayOverride: 45,
        },
      }),
      prisma.trainee.create({
        data: {
          name: "Dashboard Unassigned Trainee",
          employeeId: `${employeePrefix}-unassigned`,
          focusGroup: "D4",
          trainingStartDate: new Date("2026-07-01T00:00:00.000Z"),
          trainingDayOverride: 30,
        },
      }),
    ]);
    d2TraineeId = d2Trainee.id;
    unassignedTraineeId = unassignedTrainee.id;

    const [supervisorUser, mentorUser, traineeUser] = await Promise.all([
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-supervisor`,
          passwordHash: "integration-test-only",
        },
      }),
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-mentor`,
          passwordHash: "integration-test-only",
        },
      }),
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-trainee`,
          passwordHash: "integration-test-only",
          traineeId: d2TraineeId,
        },
      }),
    ]);

    await prisma.userTraineeRelation.createMany({
      data: [
        {
          userId: mentorUser.id,
          traineeId: d2TraineeId,
          type: "MENTOR",
          isPrimary: true,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          userId: supervisorUser.id,
          traineeId: d2TraineeId,
          type: "SUPERVISOR",
          isPrimary: true,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          userId: supervisorUser.id,
          traineeId: unassignedTraineeId,
          type: "MENTOR",
          isPrimary: false,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    supervisor = {
      userId: supervisorUser.id,
      roles: ["SUPERVISOR"],
      traineeId: null,
      enabled: true,
    };
    mentor = {
      userId: mentorUser.id,
      roles: ["MENTOR"],
      traineeId: null,
      enabled: true,
    };
    d2TraineeActor = {
      userId: traineeUser.id,
      roles: ["TRAINEE"],
      traineeId: d2TraineeId,
      enabled: true,
    };
  });

  afterAll(async () => {
    await prisma.userTraineeRelation.deleteMany({
      where: { user: { username: { startsWith: usernamePrefix } } },
    });
    await prisma.user.deleteMany({
      where: { username: { startsWith: usernamePrefix } },
    });
    await prisma.trainee.deleteMany({
      where: { employeeId: { startsWith: employeePrefix } },
    });
    await cleanupActualTrainingPlan(prisma);
    await prisma.$disconnect();
  });

  it("returns every enabled task and all five dimension metrics for a D2 trainee", async () => {
    const dashboard = await getTraineeDashboard(d2TraineeActor, d2TraineeId);

    expect(dashboard.trainee).toEqual({
      id: d2TraineeId,
      name: "Dashboard D2 Trainee",
      employeeId: `${employeePrefix}-d2`,
      focusGroup: "D2",
      currentDay: 45,
    });
    expect(dashboard.trainee).not.toHaveProperty("trainingStartDate");
    expect(dashboard.trainee).not.toHaveProperty("enabled");
    expect(dashboard.tasks).toHaveLength(90);
    expect(dashboard.tasks.every((task) => !("milestone" in task))).toBe(true);
    expect(new Set(dashboard.tasks.map(({ dimension }) => dimension))).toEqual(
      new Set(["Dall", "D1", "D2", "D3", "D4"]),
    );
    expect(dashboard.summary.learn.denominator).toBe(90);
    expect(dashboard.summary.dimensions).toEqual({
      Dall: { numerator: 0, denominator: 43, rate: 0 },
      D1: { numerator: 0, denominator: 13, rate: 0 },
      D2: { numerator: 0, denominator: 7, rate: 0 },
      D3: { numerator: 0, denominator: 13, rate: 0 },
      D4: { numerator: 0, denominator: 14, rate: 0 },
    });
  });

  it("lets a supervisor read summaries for every enabled trainee", async () => {
    const enabledTrainees = await prisma.trainee.findMany({
      where: { enabled: true },
      select: { id: true },
      orderBy: { employeeId: "asc" },
    });

    const summaries = await getTraineeSummaries(supervisor);

    expect(summaries.map(({ trainee }) => trainee.id).sort()).toEqual(
      enabledTrainees.map(({ id }) => id).sort(),
    );
    expect(summaries.find(({ trainee }) => trainee.id === d2TraineeId)?.summary.learn.denominator).toBe(
      90,
    );
    await expect(getTraineeDashboard(supervisor, unassignedTraineeId)).resolves.toMatchObject({
      trainee: { id: unassignedTraineeId },
      permissions: {
        canToggleLearn: false,
        canSubmitPractice: false,
        canConfirm: false,
        canWriteMentorNote: false,
      },
      tasks: expect.arrayContaining([
        expect.objectContaining({ dimension: "D1" }),
        expect.objectContaining({ dimension: "D2" }),
        expect.objectContaining({ dimension: "D3" }),
        expect.objectContaining({ dimension: "D4" }),
        expect.objectContaining({ dimension: "Dall" }),
      ]),
    });
  });

  it("limits mentor reads to assigned trainees", async () => {
    const summaries = await getTraineeSummaries(mentor);

    expect(summaries.map(({ trainee }) => trainee.id)).toEqual([d2TraineeId]);
    await expect(getTraineeDashboard(mentor, d2TraineeId)).resolves.toMatchObject({
      trainee: { id: d2TraineeId },
    });
    await expect(getTraineeDashboard(mentor, unassignedTraineeId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("builds a mentor dashboard from active mentor assignments and their pending work only", async () => {
    const evaluationTime = new Date("2026-08-15T04:00:00.000Z");
    const [actionTask, drillTask] = await Promise.all([
      prisma.trainingTask.findFirstOrThrow({ where: { enabled: true, action: { not: null } }, orderBy: { sortOrder: "asc" } }),
      prisma.trainingTask.findFirstOrThrow({ where: { enabled: true, drill: { not: null } }, orderBy: { sortOrder: "asc" } }),
    ]);
    await prisma.taskProgress.upsert({
      where: { traineeId_taskId: { traineeId: d2TraineeId, taskId: actionTask.id } },
      create: { traineeId: d2TraineeId, taskId: actionTask.id, actionSubmitted: true, actionSubmittedAt: evaluationTime },
      update: { actionSubmitted: true, actionSubmittedAt: evaluationTime },
    });
    await prisma.taskProgress.upsert({
      where: { traineeId_taskId: { traineeId: d2TraineeId, taskId: drillTask.id } },
      create: { traineeId: d2TraineeId, taskId: drillTask.id, drillSubmitted: true, drillSubmittedAt: evaluationTime },
      update: { drillSubmitted: true, drillSubmittedAt: evaluationTime },
    });
    const dashboard = await getMentorDashboard(mentor, evaluationTime);

    expect(dashboard.trainees.map(({ trainee }) => trainee.id)).toEqual([d2TraineeId]);
    expect(dashboard.trainees[0]).toMatchObject({
      assigned: true,
      canConfirm: true,
      stage: "P2",
      learn: { numerator: 0, denominator: 90, rate: 0 },
      due: { denominator: 45, rate: 0 },
      overdueCount: 44,
      pendingConfirmationCount: 2,
      risk: { level: "HIGH_RISK", reason: "44 项学习任务逾期" },
      reviewers: expect.arrayContaining([
        { role: "MENTOR", employeeId: `${usernamePrefix}-mentor`, primary: true },
        { role: "SUPERVISOR", employeeId: `${usernamePrefix}-supervisor`, primary: true },
      ]),
    });
    expect(dashboard.trainees[0]?.reviewers[0]).not.toHaveProperty("userId");
    expect(dashboard.confirmationQueue).toHaveLength(2);
    expect(
      dashboard.confirmationQueue.every(({ trainee }) => trainee.id === d2TraineeId),
    ).toBe(true);
    expect(new Set(dashboard.confirmationQueue.map(({ kind }) => kind))).toEqual(
      new Set(["ACTION", "DRILL"]),
    );
  });

  it("builds the all-enabled supervisor scope without granting writes", async () => {
    const evaluationTime = new Date("2026-08-15T04:00:00.000Z");
    const dashboard = await getSupervisorDashboard(supervisor, evaluationTime);
    const assigned = dashboard.trainees.find(({ trainee }) => trainee.id === d2TraineeId);
    const unassigned = dashboard.trainees.find(
      ({ trainee }) => trainee.id === unassignedTraineeId,
    );

    expect(assigned).toMatchObject({ assigned: true, canConfirm: false, accessReason: "READ_ONLY" });
    expect(unassigned).toMatchObject({ assigned: false, canConfirm: false });
    expect(dashboard.assignedSummary.traineeCount).toBe(1);
    expect(dashboard.assignedSummary.learn).toEqual({
      numerator: 0,
      denominator: 90,
      rate: 0,
    });
    expect(dashboard.allSummary.traineeCount).toBeGreaterThanOrEqual(2);
    expect(dashboard.allSummary.learn.denominator).toBe(
      dashboard.allSummary.traineeCount * 90,
    );
    expect(dashboard.allSummary.learn.rate).toBe(0);
  });

  it("keeps the supervisor dashboard read-only for a multi-role actor", async () => {
    const multiRoleActor: Actor = {
      ...mentor,
      roles: ["MENTOR", "SUPERVISOR"],
    };

    const dashboard = await getSupervisorDashboard(
      multiRoleActor,
      new Date("2026-08-15T04:00:00.000Z"),
    );
    const mentorAuthorized = dashboard.trainees.find(
      ({ trainee }) => trainee.id === d2TraineeId,
    );

    expect(mentorAuthorized).toMatchObject({
      assigned: false,
      canConfirm: false,
      accessReason: "READ_ONLY",
    });
    expect(dashboard.assignedSummary.traineeCount).toBe(0);
  });

  it("keeps same-date dashboard access through Shanghai end-of-day and expires it at the next boundary", async () => {
    const relation = await prisma.userTraineeRelation.findFirstOrThrow({
      where: { userId: mentor.userId, traineeId: d2TraineeId, type: "MENTOR" },
    });
    await prisma.userTraineeRelation.update({
      where: { id: relation.id },
      data: { startDate: new Date("2026-08-15T00:00:00.000Z"), endDate: new Date("2026-08-15T00:00:00.000Z") },
    });
    try {
      const actor: Actor = { ...mentor, roles: ["MENTOR", "SUPERVISOR"] };
      const endOfDay = await getMentorDashboard(actor, new Date("2026-08-15T15:59:59.999Z"));
      expect(endOfDay.trainees.map(({ trainee }) => trainee.id)).toContain(d2TraineeId);
      const nextDay = await getMentorDashboard(actor, new Date("2026-08-15T16:00:00.000Z"));
      expect(nextDay.trainees.map(({ trainee }) => trainee.id)).not.toContain(d2TraineeId);
    } finally {
      await prisma.userTraineeRelation.update({ where: { id: relation.id }, data: { startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: null } });
    }
  });

  it("does not grant or describe mentor collaboration from a residual relation without the mentor role", async () => {
    const dashboard = await getSupervisorDashboard(
      supervisor,
      new Date("2026-08-15T04:00:00.000Z"),
    );
    const residualMentorRelation = dashboard.trainees.find(
      ({ trainee }) => trainee.id === unassignedTraineeId,
    );

    expect(residualMentorRelation).toMatchObject({
      assigned: false,
      canConfirm: false,
      accessReason: "READ_ONLY",
    });
    expect(
      dashboard.trainees.every(
        ({ accessReason, canConfirm }) => accessReason === "READ_ONLY" || canConfirm,
      ),
    ).toBe(true);
  });

  it("keeps the supervisor surface read-only for an administrator override", async () => {
    const administrator: Actor = {
      userId: "dashboard-admin",
      roles: ["ADMIN"],
      traineeId: null,
      enabled: true,
    };

    const dashboard = await getSupervisorDashboard(
      administrator,
      new Date("2026-08-15T04:00:00.000Z"),
    );

    expect(dashboard.trainees.length).toBeGreaterThanOrEqual(2);
    expect(dashboard.trainees.every(({ assigned, canConfirm }) => assigned && !canConfirm)).toBe(
      true,
    );
    expect(dashboard.trainees.every(({ accessReason }) => accessReason === "READ_ONLY")).toBe(
      true,
    );
  });

  it("rejects role dashboard reads for an actor without the requested role", async () => {
    await expect(getMentorDashboard(d2TraineeActor)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(getSupervisorDashboard(d2TraineeActor)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});
