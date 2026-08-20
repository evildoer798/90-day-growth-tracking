import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import xlsx from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildImportPreview } from "@/domain/import/build-import-preview";
import { parseTrainingPlan } from "@/domain/import/parse-training-plan";
import {
  applyTrainingPlanImport,
  loadExistingTrainingTasks,
  prepareTrainingPlanImport,
} from "@/server/services/training-plan-import.service";
import {
  createTrainingPlanWorkbookBuffer,
  trainingPlanTaskName,
} from "../../fixtures/training-plan-workbook";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testId = randomUUID();
const workbookPath = resolve(tmpdir(), `growth-tracking-plan-${testId}.xlsx`);
const execFileAsync = promisify(execFile);

const makeAmbiguousDayOneWorkbook = (buffer: Buffer): Buffer => {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const worksheet = workbook.Sheets["90天学习计划"];
  if (!worksheet) {
    throw new Error("Test workbook is missing 90天学习计划");
  }
  worksheet.G2 = { t: "s", v: "唯一标题" };
  worksheet.H2 = {
    t: "s",
    v: "https://example.test/one\nhttps://example.test/two",
  };
  worksheet.I2 = { t: "s", v: "歧义资料不应覆盖现有引用" };
  return Buffer.from(xlsx.write(workbook, { bookType: "xlsx", type: "buffer" }));
};

runWithDatabase("training plan transactional import", () => {
  let prisma: PrismaClient;
  let actorId: string;
  let traineeId: string;

  const cleanupTaskFiveData = async () => {
    const actors = await prisma.user.findMany({
      where: { username: { startsWith: "task-5-actor-" } },
      select: { id: true },
    });
    const tasks = await prisma.trainingTask.findMany({
      where: {
        OR: [
          { stableImportKey: { startsWith: "PLAN_V1-DAY-" } },
          { stableImportKey: { startsWith: "MOVED-PLAN-V1-DAY-" } },
          { stableImportKey: { startsWith: "LEGACY-" } },
        ],
      },
      select: { id: true },
    });
    const actorIds = actors.map(({ id }) => id);
    const taskIds = tasks.map(({ id }) => id);

    if (actorIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: actorIds } } });
      await prisma.importBatch.deleteMany({ where: { operatorId: { in: actorIds } } });
    }
    if (actorIds.length > 0 || taskIds.length > 0) {
      await prisma.taskVersion.deleteMany({
        where: {
          OR: [{ actorId: { in: actorIds } }, { taskId: { in: taskIds } }],
        },
      });
    }
    if (taskIds.length > 0) {
      await prisma.confirmationEvent.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.taskProgress.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.taskReference.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.trainingTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    if (actorIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: actorIds } } });
    }
    await prisma.trainee.deleteMany({
      where: { employeeId: { startsWith: "task-5-trainee-" } },
    });
  };

  beforeAll(async () => {
    await writeFile(workbookPath, createTrainingPlanWorkbookBuffer());
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await cleanupTaskFiveData();

    const adminRole = await prisma.role.upsert({
      where: { code: "ADMIN" },
      update: {},
      create: { code: "ADMIN" },
    });
    const actor = await prisma.user.create({
      data: {
        username: `task-5-actor-${testId}`,
        passwordHash: "integration-test-only",
        roles: { create: { roleId: adminRole.id } },
      },
    });
    const trainee = await prisma.trainee.create({
      data: {
        name: "Task 5 Trainee",
        employeeId: `task-5-trainee-${testId}`,
        focusGroup: "D1",
        trainingStartDate: new Date("2026-08-14T00:00:00.000Z"),
      },
    });
    actorId = actor.id;
    traineeId = trainee.id;
  });

  afterAll(async () => {
    await cleanupTaskFiveData();
    await prisma.$disconnect();
    await rm(workbookPath, { force: true });
  });

  it("creates 90 shared tasks and records an applied batch and import audit", async () => {
    const workbook = await readFile(workbookPath);
    const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);

    expect(preview.counts).toEqual({
      create: 90,
      update: 0,
      "disable-candidate": 0,
      skip: 0,
      warning: 1,
      error: 0,
    });

    const batch = await applyTrainingPlanImport(preview, actorId, { trainingPlan });

    expect(batch.status).toBe("APPLIED");
    const importedTaskWhere = {
      stableImportKey: { startsWith: "PLAN_V1-DAY-" },
    } as const;
    expect(await prisma.trainingTask.count({ where: importedTaskWhere })).toBe(90);
    expect(
      await prisma.trainingTask.count({
        where: { ...importedTaskWhere, action: { not: null } },
      }),
    ).toBe(80);
    expect(
      await prisma.trainingTask.count({
        where: { ...importedTaskWhere, drill: { not: null } },
      }),
    ).toBe(23);
    expect(await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-071" },
      include: { references: true },
    })).toMatchObject({ references: [] });
    expect(await prisma.auditLog.findFirst({ where: { entityId: batch.id } })).toMatchObject({
      action: "IMPORT",
      entity: "TRAINING_PLAN_IMPORTED",
      actorId,
    });
  });

  it("re-imports by stable key while preserving task identity and personal progress", async () => {
    const workbook = await readFile(workbookPath);
    const dayOne = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-001" },
    });
    const progress = await prisma.taskProgress.create({
      data: {
        traineeId,
        taskId: dayOne.id,
        learnDone: true,
        feedback: "Personal progress must survive master task imports",
      },
    });
    await prisma.trainingTask.update({
      where: { id: dayOne.id },
      data: { task: "temporary stale master content" },
    });
    const legacy = await prisma.trainingTask.create({
      data: {
        stableImportKey: "LEGACY-MISSING-FROM-WORKBOOK",
        day: 90,
        stage: "P4",
        dimension: "Dall",
        dimensionName: "Legacy",
        task: "Legacy task",
        sortOrder: 999,
      },
    });

    const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
    expect(preview.counts).toMatchObject({
      create: 0,
      update: 1,
      "disable-candidate": 1,
      skip: 89,
      error: 0,
    });

    await applyTrainingPlanImport(preview, actorId, { trainingPlan });

    const importedDayOne = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-001" },
    });
    expect(importedDayOne.id).toBe(dayOne.id);
    expect(importedDayOne.task).toBe("新员工入职指引：见导师、主管，认识新同事");
    expect(await prisma.taskProgress.findUniqueOrThrow({ where: { id: progress.id } })).toMatchObject({
      taskId: dayOne.id,
      learnDone: true,
      feedback: "Personal progress must survive master task imports",
    });
    expect(await prisma.trainingTask.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({
      enabled: false,
    });
    expect(await prisma.taskVersion.findMany({ where: { taskId: dayOne.id } })).toHaveLength(1);
    expect(await prisma.taskVersion.findFirst({ where: { taskId: dayOne.id } })).toMatchObject({
      actorId,
      before: expect.objectContaining({ task: "temporary stale master content" }),
      after: expect.objectContaining({
        task: "新员工入职指引：见导师、主管，认识新同事",
      }),
    });
  });

  it("keeps tail-day tasks outside a shortened plan out of import disable candidates", async () => {
    const workbook = await readFile(workbookPath);
    const dayNinety = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-090" },
    });
    const versionCount = await prisma.taskVersion.count({ where: { taskId: dayNinety.id } });
    const shortened = await prisma.trainingPlanSettings.update({
      where: { id: "default" },
      data: { durationDays: 89, revision: { increment: 1 } },
    });

    try {
      const allTasks = await loadExistingTrainingTasks();
      const parsed = parseTrainingPlan(workbook, 90);
      const preview = buildImportPreview(
        { ...parsed, rows: parsed.rows.filter(({ day }) => day <= 89) },
        allTasks,
        89,
      );
      expect(preview.items.some(({ stableImportKey }) => stableImportKey === "PLAN_V1-DAY-090")).toBe(false);
      await applyTrainingPlanImport(preview, actorId, {
        trainingPlan: { durationDays: 89, revision: shortened.revision },
      });
      expect(await prisma.trainingTask.findUniqueOrThrow({
        where: { id: dayNinety.id },
      })).toMatchObject({ enabled: true, day: 90 });
      expect(await prisma.taskVersion.count({ where: { taskId: dayNinety.id } })).toBe(versionCount);
    } finally {
      await prisma.trainingPlanSettings.update({
        where: { id: "default" },
        data: { durationDays: 90, revision: { increment: 1 } },
      });
    }
  });

  it("refuses an error preview without writing an import batch", async () => {
    const before = await prisma.importBatch.count();

    await expect(
      applyTrainingPlanImport(
        {
          checksum: "invalid",
          fileName: "invalid.xlsx",
          rows: [],
          canApply: false,
          counts: {
            create: 0,
            update: 0,
            "disable-candidate": 0,
            skip: 0,
            warning: 0,
            error: 1,
          },
          items: [{ classification: "error", message: "Invalid workbook" }],
        },
        actorId,
        { trainingPlan: { durationDays: 90, revision: 0 } },
      ),
    ).rejects.toThrow("errors");
    expect(await prisma.importBatch.count()).toBe(before);
  });

  it("uses the shared import service for a non-writing CLI preview", async () => {
    const before = await prisma.importBatch.count();
    const tsxCli = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const script = resolve(process.cwd(), "scripts/import-training-plan.ts");

    const { stdout } = await execFileAsync(
      process.execPath,
      [tsxCli, script, "--file", workbookPath, "--preview"],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    const output: unknown = JSON.parse(stdout);

    expect(output).toMatchObject({
      mode: "preview",
      canApply: true,
      counts: {
        create: 0,
        update: 0,
        skip: 90,
        warning: 1,
        error: 0,
      },
    });
    expect(await prisma.importBatch.count()).toBe(before);
  });

  it("rejects a preview when the target state changes before apply", async () => {
    const workbook = await readFile(workbookPath);
    const dayTwo = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-002" },
    });
    await prisma.trainingTask.update({
      where: { id: dayTwo.id },
      data: { task: "previewed stale content" },
    });
    const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
    await prisma.trainingTask.update({
      where: { id: dayTwo.id },
      data: { task: "newer concurrent content" },
    });
    const batchCount = await prisma.importBatch.count();
    const versionCount = await prisma.taskVersion.count();

    await expect(applyTrainingPlanImport(preview, actorId, { trainingPlan })).rejects.toThrow("stale");

    expect(await prisma.trainingTask.findUniqueOrThrow({ where: { id: dayTwo.id } })).toMatchObject({
      task: "newer concurrent content",
    });
    expect(await prisma.importBatch.count()).toBe(batchCount);
    expect(await prisma.taskVersion.count()).toBe(versionCount);
    await prisma.trainingTask.update({
      where: { id: dayTwo.id },
      data: { task: trainingPlanTaskName(2) },
    });
  });

  it("rejects a preview when its stable key resolves to a different task ID", async () => {
    const workbook = await readFile(workbookPath);
    const dayThree = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-003" },
    });
    await prisma.trainingTask.update({
      where: { id: dayThree.id },
      data: { task: "previewed stale identity" },
    });
    const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
    await prisma.trainingTask.update({
      where: { id: dayThree.id },
      data: { stableImportKey: "MOVED-PLAN-V1-DAY-003" },
    });
    const replacement = await prisma.trainingTask.create({
      data: {
        stableImportKey: "PLAN_V1-DAY-003",
        day: 3,
        stage: "P1",
        dimension: "Dall",
        dimensionName: "Replacement",
        task: "replacement must not be touched",
        sortOrder: 3,
      },
    });

    await expect(applyTrainingPlanImport(preview, actorId, { trainingPlan })).rejects.toThrow("stale");

    expect(await prisma.trainingTask.findUniqueOrThrow({ where: { id: replacement.id } })).toMatchObject({
      task: "replacement must not be touched",
    });
    expect(await prisma.trainingTask.findUniqueOrThrow({ where: { id: dayThree.id } })).toMatchObject({
      stableImportKey: "MOVED-PLAN-V1-DAY-003",
      task: "previewed stale identity",
    });
    await prisma.trainingTask.delete({ where: { id: replacement.id } });
    await prisma.trainingTask.update({
      where: { id: dayThree.id },
      data: {
        stableImportKey: "PLAN_V1-DAY-003",
        task: trainingPlanTaskName(3),
      },
    });
  });

  it("rejects a disable candidate when its previewed state becomes stale", async () => {
    const workbook = await readFile(workbookPath);
    const legacy = await prisma.trainingTask.create({
      data: {
        stableImportKey: "LEGACY-STALE-DISABLE",
        day: 90,
        stage: "P4",
        dimension: "Dall",
        dimensionName: "Legacy",
        task: "previewed legacy content",
        sortOrder: 998,
      },
    });
    const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
    await prisma.trainingTask.update({
      where: { id: legacy.id },
      data: { task: "concurrent legacy content" },
    });
    const batchCount = await prisma.importBatch.count();

    await expect(applyTrainingPlanImport(preview, actorId, { trainingPlan })).rejects.toThrow("stale");

    expect(await prisma.trainingTask.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({
      enabled: true,
      task: "concurrent legacy content",
    });
    expect(await prisma.importBatch.count()).toBe(batchCount);
    await prisma.trainingTask.delete({ where: { id: legacy.id } });
  });

  it("preserves existing references when an ambiguous row updates other content", async () => {
    const workbook = await readFile(workbookPath);
    const dayOne = await prisma.trainingTask.findUniqueOrThrow({
      where: { stableImportKey: "PLAN_V1-DAY-001" },
      include: { references: { orderBy: { sortOrder: "asc" } } },
    });
    const { preview, trainingPlan } = await prepareTrainingPlanImport(
      makeAmbiguousDayOneWorkbook(workbook),
    );

    expect(preview.counts).toMatchObject({
      update: 1,
      skip: 89,
      warning: 2,
      error: 0,
    });
    await applyTrainingPlanImport(preview, actorId, { trainingPlan });

    const updated = await prisma.trainingTask.findUniqueOrThrow({
      where: { id: dayOne.id },
      include: { references: { orderBy: { sortOrder: "asc" } } },
    });
    expect(updated.action).toBe("歧义资料不应覆盖现有引用");
    expect(updated.references).toEqual(dayOne.references);
    expect(await prisma.taskVersion.findFirst({
      where: { taskId: dayOne.id },
      orderBy: { createdAt: "desc" },
    })).toMatchObject({
      after: expect.objectContaining({
        references: dayOne.references.map(({ title, url, sortOrder }) => ({
          title,
          url,
          sortOrder,
        })),
      }),
    });
  });
});
