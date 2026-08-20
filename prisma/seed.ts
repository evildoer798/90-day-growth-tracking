import { hash } from "bcryptjs";

import { prisma } from "../src/server/db/prisma";

const ROLE_CODES = ["ADMIN", "SUPERVISOR", "MENTOR", "TRAINEE"] as const;

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD are required to seed the administrator",
    );
  }

  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters");
  }

  await prisma.$transaction(async (tx) => {
    for (const code of ROLE_CODES) {
      await tx.role.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

    const passwordHash = await hash(password, 12);
    const admin = await tx.user.upsert({
      where: { username },
      update: { passwordHash, enabled: true },
      create: { username, passwordHash },
    });
    const adminRole = await tx.role.findUniqueOrThrow({
      where: { code: "ADMIN" },
    });

    await tx.userRole.upsert({
      where: {
        userId_roleId: { userId: admin.id, roleId: adminRole.id },
      },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
