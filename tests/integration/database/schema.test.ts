import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testRunId = randomUUID();
const TEST_ROLE_CODES = ["ADMIN", "SUPERVISOR"] as const;

runWithDatabase("PostgreSQL schema contract", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: `schema-test-${testRunId}` } },
    });
    await prisma.trainee.deleteMany({
      where: { employeeId: { startsWith: `schema-test-${testRunId}` } },
    });
    await prisma.trainingTask.deleteMany({
      where: { stableImportKey: { startsWith: `schema-test-${testRunId}` } },
    });
    await prisma.$disconnect();
  });

  it("creates a user with both ADMIN and SUPERVISOR roles", async () => {
    await Promise.all(
      TEST_ROLE_CODES.map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code },
        }),
      ),
    );

    const user = await prisma.user.create({
      data: {
        username: `schema-test-${testRunId}-multi-role`,
        passwordHash: "integration-test-only",
        roles: {
          create: [
            { role: { connect: { code: "ADMIN" } } },
            { role: { connect: { code: "SUPERVISOR" } } },
          ],
        },
      },
      include: { roles: { include: { role: true } } },
    });

    expect(user.roles.map(({ role }) => role.code).sort()).toEqual([
      "ADMIN",
      "SUPERVISOR",
    ]);
  });

  it("rejects duplicate trainee employee IDs", async () => {
    const employeeId = `schema-test-${testRunId}-employee`;

    await prisma.trainee.create({
      data: {
        name: "Schema Test One",
        employeeId,
        focusGroup: "D1",
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await expect(
      prisma.trainee.create({
        data: {
          name: "Schema Test Two",
          employeeId,
          focusGroup: "D2",
          trainingStartDate: new Date("2026-01-02T00:00:00.000Z"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects duplicate progress rows for the same trainee and task", async () => {
    const trainee = await prisma.trainee.create({
      data: {
        name: "Schema Test Progress",
        employeeId: `schema-test-${testRunId}-progress`,
        focusGroup: "D3",
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const task = await prisma.trainingTask.create({
      data: {
        stableImportKey: `schema-test-${testRunId}-task`,
        day: 1,
        stage: "P1",
        dimension: "Dall",
        dimensionName: "All dimensions",
        task: "Verify the persistence contract",
        sortOrder: 1,
      },
    });

    await prisma.taskProgress.create({
      data: { traineeId: trainee.id, taskId: task.id },
    });

    await expect(
      prisma.taskProgress.create({
        data: { traineeId: trainee.id, taskId: task.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
