import { expect, test as base, type Page } from "@playwright/test";
import { hash } from "bcryptjs";

import { prisma } from "@/server/db/prisma";
import {
  applyTrainingPlanImport,
  prepareTrainingPlanImport,
} from "@/server/services/training-plan-import.service";
import { createTrainingPlanWorkbookBuffer } from "../../fixtures/training-plan-workbook";
import {
  assertE2EDatabaseSafety,
  runE2EDatabaseLifecycle,
} from "./database-safety";

const PASSWORD = "Task13-E2E-password";

export const E2E_IDENTITIES = {
  trainee: { employeeId: "E2E_TRAINEE", name: "端到端新人" },
  mentor: { employeeId: "E2E_MENTOR", name: "端到端导师" },
  supervisor: { employeeId: "E2E_SUPERVISOR", name: "端到端主管" },
  unassignedTrainee: { employeeId: "E2E_UNASSIGNED", name: "未分配新人" },
  admin: { employeeId: "E2E_ADMIN", name: "端到端管理员" },
} as const;

type Identity = keyof typeof E2E_IDENTITIES;

export interface E2EData {
  assignedTraineeId: string;
  unassignedTraineeId: string;
  dayOneTaskId: string;
}

interface E2EFixtures {
  e2eData: E2EData;
  loginAs: (identity: Identity) => Promise<void>;
}

interface E2EWorkerFixtures {
  e2eDatabase: void;
}

const assertDedicatedDatabase = () => {
  assertE2EDatabaseSafety(process.env);
};

const truncateDatabase = async () => {
  assertDedicatedDatabase();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "ImportBatch", "TaskVersion", "ConfirmationEvent",
      "TaskProgress", "TaskReference", "TrainingTask", "UserTraineeRelation",
      "UserRole", "User", "Trainee", "Role"
    RESTART IDENTITY CASCADE
  `);
};

const resetDatabase = async (): Promise<E2EData> => {
  await truncateDatabase();

  const roles = await Promise.all(
    (["ADMIN", "SUPERVISOR", "MENTOR", "TRAINEE"] as const).map((code) =>
      prisma.role.create({ data: { code } }),
    ),
  );
  const roleId = Object.fromEntries(roles.map((role) => [role.code, role.id])) as Record<
    (typeof roles)[number]["code"],
    string
  >;
  const passwordHash = await hash(PASSWORD, 12);
  const importActor = await prisma.user.create({
    data: {
      username: "E2E_IMPORT_BOOTSTRAP",
      passwordHash,
      roles: { create: { roleId: roleId.ADMIN } },
    },
  });
  const workbook = createTrainingPlanWorkbookBuffer();
  const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
  if (!preview.canApply || preview.rows.length !== 90) {
    throw new Error("The generated 90-day workbook could not seed the E2E database");
  }
  await applyTrainingPlanImport(preview, importActor.id, { trainingPlan });

  const [assignedTrainee, unassignedTrainee] = await Promise.all([
    prisma.trainee.create({
      data: {
        name: E2E_IDENTITIES.trainee.name,
        employeeId: E2E_IDENTITIES.trainee.employeeId,
        focusGroup: "D2",
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
        trainingDayOverride: 45,
      },
    }),
    prisma.trainee.create({
      data: {
        name: E2E_IDENTITIES.unassignedTrainee.name,
        employeeId: E2E_IDENTITIES.unassignedTrainee.employeeId,
        focusGroup: "D4",
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
        trainingDayOverride: 30,
      },
    }),
  ]);

  const [trainee, mentor, supervisor, admin] = await Promise.all([
    prisma.user.create({
      data: {
        username: E2E_IDENTITIES.trainee.employeeId,
        passwordHash,
        traineeId: assignedTrainee.id,
        roles: { create: { roleId: roleId.TRAINEE } },
      },
    }),
    prisma.user.create({
      data: {
        username: E2E_IDENTITIES.mentor.employeeId,
        passwordHash,
        roles: { create: { roleId: roleId.MENTOR } },
      },
    }),
    prisma.user.create({
      data: {
        username: E2E_IDENTITIES.supervisor.employeeId,
        passwordHash,
        roles: { create: { roleId: roleId.SUPERVISOR } },
      },
    }),
    prisma.user.create({
      data: {
        username: E2E_IDENTITIES.admin.employeeId,
        passwordHash,
        roles: { create: { roleId: roleId.ADMIN } },
      },
    }),
  ]);
  void trainee;
  void admin;

  await prisma.userTraineeRelation.createMany({
    data: [
      {
        userId: mentor.id,
        traineeId: assignedTrainee.id,
        type: "MENTOR",
        isPrimary: true,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        userId: supervisor.id,
        traineeId: assignedTrainee.id,
        type: "SUPERVISOR",
        isPrimary: true,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  });

  const dayOneTask = await prisma.trainingTask.findUniqueOrThrow({
    where: { stableImportKey: "PLAN_V1-DAY-001" },
    select: { id: true },
  });
  return {
    assignedTraineeId: assignedTrainee.id,
    unassignedTraineeId: unassignedTrainee.id,
    dayOneTaskId: dayOneTask.id,
  };
};

const login = async (page: Page, identity: Identity, data: E2EData) => {
  await page.goto("/login");
  await page.getByLabel("工号").fill(E2E_IDENTITIES[identity].employeeId);
  await page.getByLabel("密码").fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  const landing = {
    trainee: `/progress/${data.assignedTraineeId}`,
    mentor: "/mentor",
    supervisor: "/supervisor",
    unassignedTrainee: "/role/trainee",
    admin: "/admin/trainees",
  } satisfies Record<Identity, string>;
  await expect(page).toHaveURL(new RegExp(`${landing[identity].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
};

export const test = base.extend<E2EFixtures, E2EWorkerFixtures>({
  e2eDatabase: [
    async ({}, use) => {
      assertDedicatedDatabase();
      await prisma.$connect();
      try {
        await use();
      } finally {
        await prisma.$disconnect();
      }
    },
    { auto: true, scope: "worker" },
  ],
  e2eData: async ({ e2eDatabase: _database }, use) => {
    void _database;
    await runE2EDatabaseLifecycle(resetDatabase, use, truncateDatabase);
  },
  loginAs: async ({ page, e2eData: _data }, use) => {
    void _data;
    await use((identity) => login(page, identity, _data));
  },
});

export { expect } from "@playwright/test";
