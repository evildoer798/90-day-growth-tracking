import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  cleanupActualTrainingPlan,
  ensureActualTrainingPlan,
} from "./actual-training-plan.fixture";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;

runWithDatabase("actual training plan integration fixture", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupActualTrainingPlan(prisma);
    await prisma.$disconnect();
  });

  it("imports the generated 90-row workbook and removes every fixture-owned record", async () => {
    await ensureActualTrainingPlan(prisma);

    expect(await prisma.trainingTask.count({
      where: { stableImportKey: { startsWith: "PLAN_V1-DAY-" } },
    })).toBe(90);
    await cleanupActualTrainingPlan(prisma);
    expect(await prisma.trainingTask.count({
      where: { stableImportKey: { startsWith: "PLAN_V1-DAY-" } },
    })).toBe(0);
    expect(await prisma.user.count({
      where: { username: "task-7-real-plan-fixture-actor" },
    })).toBe(0);
    expect(await prisma.importBatch.count({
      where: { operator: { username: "task-7-real-plan-fixture-actor" } },
    })).toBe(0);
    expect(await prisma.auditLog.count({
      where: { actor: { username: "task-7-real-plan-fixture-actor" } },
    })).toBe(0);
  });
});
