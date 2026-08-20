import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROGRESS_TEXT_LIMITS } from "@/config/input-limits.config";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/server/auth/get-actor";
import {
  saveTaskNotes,
  setConfirmation,
  setPracticeSubmission,
  toggleLearn,
} from "@/server/services/progress.service";
import {
  cleanupActualTrainingPlan,
  ensureActualTrainingPlan,
} from "./actual-training-plan.fixture";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testRunId = randomUUID();
const usernamePrefix = `task-7-mutation-user-${testRunId}`;
const employeePrefix = `task-7-mutation-trainee-${testRunId}`;

runWithDatabase("secured progress mutations", () => {
  let prisma: PrismaClient;
  let trainee: Actor;
  let mentor: Actor;
  let supervisor: Actor;
  let admin: Actor;
  let traineeId: string;
  let otherTraineeId: string;
  let actionTaskId: string;
  let drillTaskId: string;
  let concurrentTaskId: string;
  let absentConcurrentTaskId: string;
  let mentorRelationId: string;
  let adminRoleId: string;
  let mentorRoleId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await ensureActualTrainingPlan(prisma);

    const [adminRole, mentorRole, supervisorRole, traineeRole] = await Promise.all(
      (["ADMIN", "MENTOR", "SUPERVISOR", "TRAINEE"] as const).map((code) =>
        prisma.role.upsert({ where: { code }, update: {}, create: { code } }),
      ),
    );
    adminRoleId = adminRole.id;
    mentorRoleId = mentorRole.id;

    const [actionTask, drillTask, concurrencyTasks] = await Promise.all([
      prisma.trainingTask.findFirstOrThrow({
        where: {
          stableImportKey: { startsWith: "PLAN_V1-DAY-" },
          enabled: true,
          action: { not: null },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.trainingTask.findFirstOrThrow({
        where: {
          stableImportKey: { startsWith: "PLAN_V1-DAY-" },
          enabled: true,
          drill: { not: null },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.trainingTask.findMany({
        where: {
          stableImportKey: { startsWith: "PLAN_V1-DAY-" },
          enabled: true,
        },
        orderBy: { sortOrder: "desc" },
        take: 2,
      }),
    ]);
    actionTaskId = actionTask.id;
    drillTaskId = drillTask.id;
    const [concurrentTask, absentConcurrentTask] = concurrencyTasks;
    if (!concurrentTask || !absentConcurrentTask) {
      throw new Error("Actual training plan needs two plain tasks for concurrency coverage");
    }
    concurrentTaskId = concurrentTask.id;
    absentConcurrentTaskId = absentConcurrentTask.id;

    const [traineeRecord, otherTrainee] = await Promise.all([
      prisma.trainee.create({
        data: {
          name: "Mutation Trainee",
          employeeId: `${employeePrefix}-self`,
          focusGroup: "D1",
          trainingStartDate: new Date("2026-08-01T00:00:00.000Z"),
        },
      }),
      prisma.trainee.create({
        data: {
          name: "Mutation Other Trainee",
          employeeId: `${employeePrefix}-other`,
          focusGroup: "D3",
          trainingStartDate: new Date("2026-08-01T00:00:00.000Z"),
        },
      }),
    ]);
    traineeId = traineeRecord.id;
    otherTraineeId = otherTrainee.id;

    const [traineeUser, mentorUser, supervisorUser, adminUser] = await Promise.all([
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-trainee`,
          passwordHash: "integration-test-only",
          traineeId,
          roles: { create: [{ roleId: traineeRole.id }] },
        },
      }),
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-mentor`,
          passwordHash: "integration-test-only",
          roles: { create: [{ roleId: mentorRole.id }] },
        },
      }),
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-supervisor`,
          passwordHash: "integration-test-only",
          roles: { create: [{ roleId: supervisorRole.id }] },
        },
      }),
      prisma.user.create({
        data: {
          username: `${usernamePrefix}-admin`,
          passwordHash: "integration-test-only",
          roles: { create: [{ roleId: adminRole.id }] },
        },
      }),
    ]);

    const [mentorRelation] = await Promise.all([
      prisma.userTraineeRelation.create({
        data: {
          userId: mentorUser.id,
          traineeId,
          type: "MENTOR",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
      prisma.userTraineeRelation.create({
        data: {
          userId: supervisorUser.id,
          traineeId,
          type: "SUPERVISOR",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    ]);
    mentorRelationId = mentorRelation.id;

    trainee = {
      userId: traineeUser.id,
      roles: ["TRAINEE"],
      traineeId,
      enabled: true,
    };
    mentor = {
      userId: mentorUser.id,
      roles: ["MENTOR"],
      traineeId: null,
      enabled: true,
    };
    supervisor = {
      userId: supervisorUser.id,
      roles: ["SUPERVISOR"],
      traineeId: null,
      enabled: true,
    };
    admin = {
      userId: adminUser.id,
      roles: ["ADMIN"],
      traineeId: null,
      enabled: true,
    };
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { username: { startsWith: usernamePrefix } },
      select: { id: true },
    });
    const trainees = await prisma.trainee.findMany({
      where: { employeeId: { startsWith: employeePrefix } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const traineeIds = trainees.map(({ id }) => id);

    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.confirmationEvent.deleteMany({ where: { traineeId: { in: traineeIds } } });
    await prisma.taskProgress.deleteMany({ where: { traineeId: { in: traineeIds } } });
    await prisma.userTraineeRelation.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { traineeId: { in: traineeIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.trainee.deleteMany({ where: { id: { in: traineeIds } } });
    await cleanupActualTrainingPlan(prisma);
    await prisma.$disconnect();
  });

  it("toggles a trainee's own Learn state and writes its audit atomically", async () => {
    const result = await toggleLearn(trainee, {
      traineeId,
      taskId: actionTaskId,
      learnDone: true,
    });

    expect(result).toEqual({
      id: expect.any(String),
      traineeId,
      taskId: actionTaskId,
      learnDone: true,
      learnAt: expect.any(Date),
    });
    expect(await prisma.taskProgress.findUniqueOrThrow({
      where: { traineeId_taskId: { traineeId, taskId: actionTaskId } },
    })).toMatchObject({ learnDone: true, learnAt: expect.any(Date) });
    expect(await prisma.auditLog.findFirst({
      where: { actorId: trainee.userId, entity: "TASK_PROGRESS", entityId: result.id },
      orderBy: { createdAt: "desc" },
    })).toMatchObject({
      action: "UPDATE",
      after: expect.objectContaining({ learnDone: true }),
    });
  });

  it("creates mentor work only after the trainee submits that specific practice", async () => {
    await prisma.taskProgress.upsert({
      where: { traineeId_taskId: { traineeId, taskId: actionTaskId } },
      create: { traineeId, taskId: actionTaskId },
      update: {
        actionSubmitted: false,
        actionSubmittedAt: null,
        actionConfirmed: false,
        actionConfirmedAt: null,
        actionConfirmedById: null,
      },
    });

    await expect(setConfirmation(mentor, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
    })).rejects.toMatchObject({ code: "INVALID_PROGRESS_MUTATION", status: 400 });

    const submitted = await setPracticeSubmission(trainee, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      submitted: true,
    });
    expect(submitted).toMatchObject({ kind: "ACTION", submitted: true, submittedAt: expect.any(Date) });

    await expect(setConfirmation(mentor, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
    })).resolves.toMatchObject({ kind: "ACTION", confirmed: true });
  });

  it("keeps the supervisor role read-only even for an assigned trainee", async () => {
    await setPracticeSubmission(trainee, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      submitted: true,
    });

    await expect(setConfirmation(supervisor, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      confirmed: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(saveTaskNotes(supervisor, {
      traineeId,
      taskId: drillTaskId,
      mentorNote: "supervisors cannot write mentor messages",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("records immutable confirmation history and an audit for assigned staff", async () => {
    await prisma.confirmationEvent.deleteMany({
      where: { traineeId, taskId: { in: [actionTaskId, drillTaskId] } },
    });
    await setPracticeSubmission(trainee, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      submitted: true,
    });
    const confirmed = await setConfirmation(mentor, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
      note: "Observed on the machine",
    });

    expect(confirmed).toEqual({
      id: expect.any(String),
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
      confirmedAt: expect.any(Date),
    });
    expect(await prisma.confirmationEvent.findFirst({
      where: { traineeId, taskId: actionTaskId, actorId: mentor.userId },
      orderBy: { createdAt: "desc" },
    })).toMatchObject({ kind: "ACTION_CONFIRMED", note: "Observed on the machine" });
    expect(await prisma.auditLog.findFirst({
      where: { actorId: mentor.userId, entity: "TASK_PROGRESS", entityId: confirmed.id },
      orderBy: { createdAt: "desc" },
    })).toMatchObject({ action: "CONFIRM" });

    await setPracticeSubmission(trainee, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      submitted: true,
    });
    await setConfirmation(mentor, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      confirmed: true,
    });
    expect(await prisma.confirmationEvent.findFirst({
      where: { traineeId, taskId: drillTaskId, actorId: mentor.userId },
    })).toMatchObject({ kind: "DRILL_CONFIRMED" });
  });

  it("retains confirmation and unconfirmation history while clearing current state", async () => {
    await setPracticeSubmission(trainee, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      submitted: true,
    });
    const result = await setConfirmation(mentor, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: false,
      note: "Practice must be repeated",
    });

    expect(result).toEqual({
      id: expect.any(String),
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: false,
      confirmedAt: null,
    });
    expect(await prisma.taskProgress.findUniqueOrThrow({
      where: { traineeId_taskId: { traineeId, taskId: actionTaskId } },
    })).toMatchObject({
      actionConfirmed: false,
      actionConfirmedAt: null,
      actionConfirmedById: null,
    });
    expect((await prisma.confirmationEvent.findMany({
      where: { traineeId, taskId: actionTaskId },
      orderBy: { createdAt: "asc" },
      select: { kind: true },
    })).map(({ kind }) => kind)).toEqual([
      "ACTION_CONFIRMED",
      "ACTION_UNCONFIRMED",
    ]);
  });

  it("saves self notes and assigned staff notes with audits", async () => {
    const existingProgress = await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId, taskId: drillTaskId } },
      select: { id: true },
    });
    const auditCountBefore = existingProgress
      ? await prisma.auditLog.count({
          where: {
            entityId: existingProgress.id,
            actorId: { in: [trainee.userId, mentor.userId] },
            action: "UPDATE",
          },
        })
      : 0;

    const selfNotes = await saveTaskNotes(trainee, {
      traineeId,
      taskId: drillTaskId,
      feedback: "I need another practice run",
      traineeNote: "Review the setup checklist",
    });
    expect(selfNotes).toEqual({
      id: expect.any(String),
      traineeId,
      taskId: drillTaskId,
      feedback: "I need another practice run",
      traineeNote: "Review the setup checklist",
    });

    const staffNotes = await saveTaskNotes(mentor, {
      traineeId,
      taskId: drillTaskId,
      mentorNote: "Repeat with the supervisor next week",
    });
    expect(staffNotes).toEqual({
      id: expect.any(String),
      traineeId,
      taskId: drillTaskId,
      mentorNote: "Repeat with the supervisor next week",
    });
    expect(await prisma.auditLog.count({
      where: {
        entityId: staffNotes.id,
        actorId: { in: [trainee.userId, mentor.userId] },
        action: "UPDATE",
      },
    })).toBe(auditCountBefore + 2);
  });

  it("rejects oversized notes before any progress, confirmation, or audit write", async () => {
    const before = {
      progress: await prisma.taskProgress.count(),
      events: await prisma.confirmationEvent.count(),
      audits: await prisma.auditLog.count(),
    };

    await expect(saveTaskNotes(trainee, {
      traineeId,
      taskId: concurrentTaskId,
      feedback: "x".repeat(PROGRESS_TEXT_LIMITS.feedback + 1),
    })).rejects.toBeTruthy();
    await expect(saveTaskNotes(mentor, {
      traineeId,
      taskId: concurrentTaskId,
      mentorNote: "x".repeat(PROGRESS_TEXT_LIMITS.mentorNote + 1),
    })).rejects.toBeTruthy();
    await expect(setConfirmation(mentor, {
      traineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
      note: "x".repeat(PROGRESS_TEXT_LIMITS.confirmationNote + 1),
    })).rejects.toBeTruthy();

    expect(await prisma.taskProgress.count()).toBe(before.progress);
    expect(await prisma.confirmationEvent.count()).toBe(before.events);
    expect(await prisma.auditLog.count()).toBe(before.audits);
  });

  it("rejects note fields outside the actor's role with all-or-nothing writes", async () => {
    const before = await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId, taskId: concurrentTaskId } },
    });
    const auditCount = await prisma.auditLog.count({
      where: { entity: "TASK_PROGRESS", actorId: { in: [trainee.userId, mentor.userId] } },
    });

    await expect(saveTaskNotes(trainee, {
      traineeId,
      taskId: concurrentTaskId,
      mentorNote: "trainees cannot write this",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(saveTaskNotes(mentor, {
      traineeId,
      taskId: concurrentTaskId,
      feedback: "staff cannot write trainee feedback",
      traineeNote: "staff cannot write trainee notes",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(saveTaskNotes(trainee, {
      traineeId,
      taskId: concurrentTaskId,
      feedback: "allowed alone but not in a mixed payload",
      mentorNote: "forbidden makes the entire payload fail",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId, taskId: concurrentTaskId } },
    })).toEqual(before);
    expect(await prisma.auditLog.count({
      where: { entity: "TASK_PROGRESS", actorId: { in: [trainee.userId, mentor.userId] } },
    })).toBe(auditCount);
  });

  it("serializes concurrent writers into a valid audit before/after chain", async () => {
    const seeded = await prisma.taskProgress.create({
      data: { traineeId: otherTraineeId, taskId: concurrentTaskId, learnDone: false },
    });
    let releaseLock: (() => void) | undefined;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let locked: (() => void) | undefined;
    const rowLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const locker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "TaskProgress" WHERE "id" = ${seeded.id} FOR UPDATE
      `;
      locked?.();
      await lockReleased;
    });
    await rowLocked;

    const mutations = [
      toggleLearn(admin, {
        traineeId: otherTraineeId,
        taskId: concurrentTaskId,
        learnDone: true,
      }),
      toggleLearn(admin, {
        traineeId: otherTraineeId,
        taskId: concurrentTaskId,
        learnDone: false,
      }),
    ];
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const waiting = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%TaskProgress%'
      `;
      if (Number(waiting[0]?.count ?? 0n) >= 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    releaseLock?.();
    await locker;
    await Promise.all(mutations);

    const audits = await prisma.auditLog.findMany({
      where: { actorId: admin.userId, entity: "TASK_PROGRESS", entityId: seeded.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
    const first = audits.find(({ before }) => before !== null && (before as { learnDone?: boolean }).learnDone === false);
    const second = audits.find(({ id }) => id !== first?.id);
    expect(first).toBeDefined();
    expect(second?.before).toEqual(first?.after);
    const persisted = await prisma.taskProgress.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(JSON.parse(JSON.stringify(persisted))).toMatchObject(second?.after as object);
  });

  it("serializes concurrent upserts when the progress row is initially absent", async () => {
    expect(await prisma.taskProgress.findUnique({
      where: {
        traineeId_taskId: {
          traineeId: otherTraineeId,
          taskId: absentConcurrentTaskId,
        },
      },
    })).toBeNull();

    let releaseLock: (() => void) | undefined;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let locked: (() => void) | undefined;
    const traineeLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const locker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "Trainee" WHERE "id" = ${otherTraineeId} FOR UPDATE
      `;
      locked?.();
      await lockReleased;
    });
    await traineeLocked;
    const mutations = [
      toggleLearn(admin, {
        traineeId: otherTraineeId,
        taskId: absentConcurrentTaskId,
        learnDone: true,
      }),
      toggleLearn(admin, {
        traineeId: otherTraineeId,
        taskId: absentConcurrentTaskId,
        learnDone: false,
      }),
    ];
    const deadline = Date.now() + 5_000;
    let waitingCount = 0;
    while (Date.now() < deadline) {
      const waiting = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%Trainee%'
      `;
      waitingCount = Number(waiting[0]?.count ?? 0n);
      if (waitingCount >= 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    releaseLock?.();
    await locker;
    expect(waitingCount).toBeGreaterThanOrEqual(2);
    await Promise.all(mutations);

    const progress = await prisma.taskProgress.findUniqueOrThrow({
      where: {
        traineeId_taskId: {
          traineeId: otherTraineeId,
          taskId: absentConcurrentTaskId,
        },
      },
    });
    const audits = await prisma.auditLog.findMany({
      where: { actorId: admin.userId, entity: "TASK_PROGRESS", entityId: progress.id },
    });
    expect(audits).toHaveLength(2);
    const initial = audits.find(({ before }) => before === null);
    const successor = audits.find(({ id }) => id !== initial?.id);
    expect(initial).toBeDefined();
    expect(successor?.before).toEqual(initial?.after);
    expect(JSON.parse(JSON.stringify(progress))).toMatchObject(successor?.after as object);
  });

  it("checks the actor's live enabled state inside the write transaction", async () => {
    await prisma.user.update({ where: { id: trainee.userId }, data: { enabled: false } });
    const before = {
      progress: await prisma.taskProgress.findUnique({
        where: {
          traineeId_taskId: { traineeId, taskId: absentConcurrentTaskId },
        },
      }),
      audits: await prisma.auditLog.count({ where: { actorId: trainee.userId } }),
    };

    await expect(toggleLearn(trainee, {
      traineeId,
      taskId: absentConcurrentTaskId,
      learnDone: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId, taskId: absentConcurrentTaskId } },
    })).toEqual(before.progress);
    expect(await prisma.auditLog.count({ where: { actorId: trainee.userId } })).toBe(before.audits);
    await prisma.user.update({ where: { id: trainee.userId }, data: { enabled: true } });
  });

  it("rejects a stale ADMIN session after its database role is revoked", async () => {
    const before = {
      progress: await prisma.taskProgress.findUnique({
        where: {
          traineeId_taskId: { traineeId: otherTraineeId, taskId: actionTaskId },
        },
      }),
      audits: await prisma.auditLog.count({ where: { actorId: admin.userId } }),
    };
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: admin.userId, roleId: adminRoleId } },
    });
    let rejection: unknown;
    try {
      await saveTaskNotes(admin, {
        traineeId: otherTraineeId,
        taskId: actionTaskId,
        mentorNote: "stale administrator must not write",
      });
    } catch (error: unknown) {
      rejection = error;
    } finally {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.userId, roleId: adminRoleId } },
        update: {},
        create: { userId: admin.userId, roleId: adminRoleId },
      });
    }

    expect(rejection).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId: otherTraineeId, taskId: actionTaskId } },
    })).toEqual(before.progress);
    expect(await prisma.auditLog.count({ where: { actorId: admin.userId } })).toBe(before.audits);
  });

  it("rejects a stale MENTOR session after its database role is revoked", async () => {
    const before = {
      events: await prisma.confirmationEvent.count({
        where: { traineeId, taskId: actionTaskId, actorId: mentor.userId },
      }),
      audits: await prisma.auditLog.count({ where: { actorId: mentor.userId } }),
    };
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: mentor.userId, roleId: mentorRoleId } },
    });
    let rejection: unknown;
    try {
      await setConfirmation(mentor, {
        traineeId,
        taskId: actionTaskId,
        kind: "ACTION",
        confirmed: true,
      });
    } catch (error: unknown) {
      rejection = error;
    } finally {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: mentor.userId, roleId: mentorRoleId } },
        update: {},
        create: { userId: mentor.userId, roleId: mentorRoleId },
      });
    }

    expect(rejection).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await prisma.confirmationEvent.count({
      where: { traineeId, taskId: actionTaskId, actorId: mentor.userId },
    })).toBe(before.events);
    expect(await prisma.auditLog.count({ where: { actorId: mentor.userId } })).toBe(before.audits);
  });

  it("rejects a stale trainee session after its database trainee link is removed or reassigned", async () => {
    const before = {
      progress: await prisma.taskProgress.findUnique({
        where: { traineeId_taskId: { traineeId, taskId: absentConcurrentTaskId } },
      }),
      audits: await prisma.auditLog.count({ where: { actorId: trainee.userId } }),
    };
    const rejections: unknown[] = [];

    try {
      await prisma.user.update({ where: { id: trainee.userId }, data: { traineeId: null } });
      try {
        await toggleLearn(trainee, {
          traineeId,
          taskId: absentConcurrentTaskId,
          learnDone: true,
        });
      } catch (error: unknown) {
        rejections.push(error);
      }

      await prisma.user.update({
        where: { id: trainee.userId },
        data: { traineeId: otherTraineeId },
      });
      try {
        await toggleLearn(trainee, {
          traineeId,
          taskId: absentConcurrentTaskId,
          learnDone: true,
        });
      } catch (error: unknown) {
        rejections.push(error);
      }
    } finally {
      await prisma.user.update({ where: { id: trainee.userId }, data: { traineeId } });
    }

    expect(rejections).toHaveLength(2);
    for (const rejection of rejections) {
      expect(rejection).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect(await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId, taskId: absentConcurrentTaskId } },
    })).toEqual(before.progress);
    expect(await prisma.auditLog.count({ where: { actorId: trainee.userId } })).toBe(before.audits);
  });

  it("prevents role revocation from overtaking an authorized in-flight mutation", async () => {
    const progress = await prisma.taskProgress.upsert({
      where: {
        traineeId_taskId: { traineeId: otherTraineeId, taskId: absentConcurrentTaskId },
      },
      create: { traineeId: otherTraineeId, taskId: absentConcurrentTaskId },
      update: {},
    });
    let releaseLock: (() => void) | undefined;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let locked: (() => void) | undefined;
    const progressLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const locker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "TaskProgress" WHERE "id" = ${progress.id} FOR UPDATE
      `;
      locked?.();
      await lockReleased;
    });
    await progressLocked;

    const mutation = toggleLearn(admin, {
      traineeId: otherTraineeId,
      taskId: absentConcurrentTaskId,
      learnDone: true,
    });
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const waiting = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%TaskProgress%'
      `;
      if (Number(waiting[0]?.count ?? 0n) >= 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const revocationError = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
      await transaction.userRole.delete({
        where: { userId_roleId: { userId: admin.userId, roleId: adminRoleId } },
      });
    }).then(() => null, (error: unknown) => error);
    releaseLock?.();
    await locker;
    await mutation;

    try {
      expect(revocationError).toBeTruthy();
      await prisma.userRole.delete({
        where: { userId_roleId: { userId: admin.userId, roleId: adminRoleId } },
      });
      const auditCount = await prisma.auditLog.count({ where: { actorId: admin.userId } });
      await expect(toggleLearn(admin, {
        traineeId: otherTraineeId,
        taskId: absentConcurrentTaskId,
        learnDone: false,
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      expect(await prisma.auditLog.count({ where: { actorId: admin.userId } })).toBe(auditCount);
    } finally {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.userId, roleId: adminRoleId } },
        update: {},
        create: { userId: admin.userId, roleId: adminRoleId },
      });
    }
  });

  it("prevents assignment revocation from overtaking an authorized in-flight mutation", async () => {
    const progress = await prisma.taskProgress.upsert({
      where: { traineeId_taskId: { traineeId, taskId: drillTaskId } },
      create: { traineeId, taskId: drillTaskId, drillSubmitted: true, drillSubmittedAt: new Date() },
      update: { drillSubmitted: true, drillSubmittedAt: new Date() },
    });
    let releaseLock: (() => void) | undefined;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let locked: (() => void) | undefined;
    const rowLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const locker = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "TaskProgress" WHERE "id" = ${progress.id} FOR UPDATE
      `;
      locked?.();
      await lockReleased;
    });
    await rowLocked;

    const mutation = setConfirmation(mentor, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      confirmed: true,
    });
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const waiting = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%TaskProgress%'
      `;
      if (Number(waiting[0]?.count ?? 0n) >= 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const revocationError = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '200ms'");
      await transaction.userTraineeRelation.update({
        where: { id: mentorRelationId },
        data: { enabled: false },
      });
    }).then(() => null, (error: unknown) => error);
    releaseLock?.();
    await locker;
    await mutation;
    expect(revocationError).toBeTruthy();

    await prisma.userTraineeRelation.update({
      where: { id: mentorRelationId },
      data: { enabled: false },
    });
    const eventCount = await prisma.confirmationEvent.count({
      where: { traineeId, taskId: drillTaskId, actorId: mentor.userId },
    });
    await expect(setConfirmation(mentor, {
      traineeId,
      taskId: drillTaskId,
      kind: "DRILL",
      confirmed: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await prisma.confirmationEvent.count({
      where: { traineeId, taskId: drillTaskId, actorId: mentor.userId },
    })).toBe(eventCount);
    await prisma.userTraineeRelation.update({
      where: { id: mentorRelationId },
      data: { enabled: true },
    });
  });

  it("rejects cross-person and unassigned mutations without writing anything", async () => {
    const before = {
      progress: await prisma.taskProgress.count({
        where: { traineeId: otherTraineeId, taskId: actionTaskId },
      }),
      events: await prisma.confirmationEvent.count({
        where: { traineeId: otherTraineeId, taskId: actionTaskId },
      }),
      audits: await prisma.auditLog.count({
        where: { actorId: { in: [trainee.userId, mentor.userId, supervisor.userId] } },
      }),
    };

    await expect(toggleLearn(trainee, {
      traineeId: otherTraineeId,
      taskId: actionTaskId,
      learnDone: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(setConfirmation(mentor, {
      traineeId: otherTraineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(setConfirmation(supervisor, {
      traineeId: otherTraineeId,
      taskId: actionTaskId,
      kind: "ACTION",
      confirmed: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(saveTaskNotes(supervisor, {
      traineeId: otherTraineeId,
      taskId: actionTaskId,
      mentorNote: "must not be written",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(await prisma.taskProgress.count({
      where: { traineeId: otherTraineeId, taskId: actionTaskId },
    })).toBe(before.progress);
    expect(await prisma.confirmationEvent.count({
      where: { traineeId: otherTraineeId, taskId: actionTaskId },
    })).toBe(before.events);
    expect(await prisma.auditLog.count({
      where: { actorId: { in: [trainee.userId, mentor.userId, supervisor.userId] } },
    })).toBe(before.audits);
  });

  it("lets an administrator override person scope", async () => {
    await expect(saveTaskNotes(admin, {
      traineeId: otherTraineeId,
      taskId: actionTaskId,
      mentorNote: "Administrator correction",
    })).resolves.toMatchObject({ mentorNote: "Administrator correction" });
  });

  it("rolls back a progress write when its audit cannot be inserted", async () => {
    const missingAdmin: Actor = {
      userId: `missing-task-7-actor-${testRunId}`,
      roles: ["ADMIN"],
      traineeId: null,
      enabled: true,
    };
    const before = await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId: otherTraineeId, taskId: drillTaskId } },
    });

    await expect(toggleLearn(missingAdmin, {
      traineeId: otherTraineeId,
      taskId: drillTaskId,
      learnDone: true,
    })).rejects.toBeTruthy();

    expect(await prisma.taskProgress.findUnique({
      where: { traineeId_taskId: { traineeId: otherTraineeId, taskId: drillTaskId } },
    })).toEqual(before);
  });
});
