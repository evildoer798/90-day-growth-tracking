import { randomUUID } from "node:crypto";

import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  authorizeCredentials,
  createSessionFromToken,
  writeClaimsToToken,
} from "@/server/auth/credentials";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testRunId = randomUUID();
const usernamePrefix = `task-6-auth-${testRunId}`;
const validPassword = "  preserved password characters  ";

runWithDatabase("credentials authentication", () => {
  let prisma: PrismaClient;
  let enabledUsername: string;
  let enabledUserId: string;
  let traineeId: string;
  let disabledUsername: string;
  let invalidHashUsername: string;
  let unsupportedCostUsername: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();

    await Promise.all(
      (["ADMIN", "MENTOR", "TRAINEE"] as const).map((code) =>
        prisma.role.upsert({
          where: { code },
          update: {},
          create: { code },
        }),
      ),
    );

    const supportedPasswordHash = await hash(validPassword, 12);
    const trainee = await prisma.trainee.create({
      data: {
        name: "Task 6 Auth Trainee",
        employeeId: `${usernamePrefix}-trainee-record`,
        focusGroup: "D1",
        trainingStartDate: new Date("2026-08-14T00:00:00.000Z"),
      },
    });
    traineeId = trainee.id;
    enabledUsername = `${usernamePrefix}-enabled`;
    const enabledUser = await prisma.user.create({
      data: {
        username: enabledUsername,
        passwordHash: supportedPasswordHash,
        traineeId,
        roles: {
          create: [
            { role: { connect: { code: "MENTOR" } } },
            { role: { connect: { code: "TRAINEE" } } },
          ],
        },
      },
    });
    enabledUserId = enabledUser.id;

    disabledUsername = `${usernamePrefix}-disabled`;
    await prisma.user.create({
      data: {
        username: disabledUsername,
        passwordHash: supportedPasswordHash,
        enabled: false,
        roles: { create: [{ role: { connect: { code: "ADMIN" } } }] },
      },
    });

    invalidHashUsername = `${usernamePrefix}-invalid-hash`;
    await prisma.user.create({
      data: {
        username: invalidHashUsername,
        passwordHash: "not-a-valid-bcrypt-hash",
        roles: { create: [{ role: { connect: { code: "ADMIN" } } }] },
      },
    });

    unsupportedCostUsername = `${usernamePrefix}-cost4`;
    await prisma.user.create({
      data: {
        username: unsupportedCostUsername,
        passwordHash: await hash(validPassword, 4),
        roles: { create: [{ role: { connect: { code: "ADMIN" } } }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { startsWith: usernamePrefix } },
    });
    await prisma.trainee.deleteMany({
      where: { employeeId: { startsWith: usernamePrefix } },
    });
    await prisma.$disconnect();
  });

  it("authenticates an enabled normalized employee ID with every role and trainee claim", async () => {
    const result = await authorizeCredentials({
      employeeId: `  ${enabledUsername}  `,
      password: validPassword,
    });

    expect(result).toEqual({
      id: enabledUserId,
      employeeId: enabledUsername,
      roles: ["MENTOR", "TRAINEE"],
      traineeId,
      enabled: true,
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("fails with the same non-enumerating outcome for every ineligible identity or credential", async () => {
    const attempts = [
      { employeeId: `${usernamePrefix}-missing`, password: validPassword },
      { employeeId: enabledUsername, password: "wrong password" },
      { employeeId: disabledUsername, password: validPassword },
      { employeeId: invalidHashUsername, password: validPassword },
      { employeeId: unsupportedCostUsername, password: validPassword },
    ];

    await Promise.all(
      attempts.map(async (credentials) => {
        await expect(authorizeCredentials(credentials)).resolves.toBeNull();
      }),
    );
  });

  it("projects only permitted identity claims into the JWT and session", async () => {
    const user = await authorizeCredentials({
      employeeId: enabledUsername,
      password: validPassword,
    });
    expect(user).not.toBeNull();

    const token = writeClaimsToToken(
      {
        name: "must not survive",
        email: "must-not-survive@example.test",
        picture: "https://example.test/must-not-survive.png",
      },
      user!,
    );
    const session = createSessionFromToken(
      { expires: "2026-08-15T00:00:00.000Z", user: undefined },
      token,
    );

    expect(token).toEqual({
      sub: enabledUserId,
      employeeId: enabledUsername,
      roles: ["MENTOR", "TRAINEE"],
      traineeId,
      enabled: true,
    });
    expect(session).toEqual({
      expires: "2026-08-15T00:00:00.000Z",
      user: {
        id: enabledUserId,
        employeeId: enabledUsername,
        roles: ["MENTOR", "TRAINEE"],
        traineeId,
        enabled: true,
      },
    });
    expect(JSON.stringify({ token, session })).not.toContain("passwordHash");
    expect(JSON.stringify({ token, session })).not.toContain(validPassword);
  });
});
