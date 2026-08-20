import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

runWithDatabase("Task 11 temporal relation migration", () => {
  it("prefers the current assignment, retains a non-overlapping schedule, and renders valid history dates", async () => {
    const connection = new URL(process.env.DATABASE_URL!);
    connection.search = "";
    const client = new Client({ connectionString: connection.toString() });
    const schema = `task11_migration_${randomUUID().replaceAll("-", "")}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await client.query(`CREATE TYPE "RelationType" AS ENUM ('MENTOR', 'SUPERVISOR')`);
      await client.query(`
        CREATE TABLE "UserTraineeRelation" (
          "id" text PRIMARY KEY, "traineeId" text NOT NULL, "type" "RelationType" NOT NULL,
          "enabled" boolean NOT NULL DEFAULT true, "startDate" date NOT NULL, "endDate" date,
          "createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL
        );
        CREATE TABLE "ImportBatch" ("id" text PRIMARY KEY);
        INSERT INTO "ImportBatch" ("id") VALUES ('batch');
      `);
      await client.query(`
        INSERT INTO "UserTraineeRelation" VALUES
          ('prior', 't1', 'MENTOR', true, CURRENT_DATE - 50, CURRENT_DATE - 30, '2026-01-01', '2026-01-01'),
          ('predecessor', 't1', 'MENTOR', true, CURRENT_DATE - 30, CURRENT_DATE - 10, '2026-01-01 12:00', '2026-01-01 12:00'),
          ('current', 't1', 'MENTOR', true, CURRENT_DATE - 20, NULL, '2026-01-02', '2026-01-02'),
          ('expired-overlap', 't1', 'MENTOR', true, CURRENT_DATE - 10, CURRENT_DATE - 5, '2026-01-03', '2026-01-03'),
          ('future-old', 't1', 'MENTOR', true, CURRENT_DATE + 10, NULL, '2026-01-04', '2026-01-04'),
          ('future-new', 't1', 'MENTOR', true, CURRENT_DATE + 10, NULL, '2026-01-05', '2026-01-05'),
          ('future-later', 't1', 'MENTOR', true, CURRENT_DATE + 20, NULL, '2026-01-06', '2026-01-06'),
          ('broken-cancelled', 't1', 'SUPERVISOR', false, CURRENT_DATE + 5, NULL, '2026-01-07', '2026-01-07')
      `);
      const migration = await readFile(resolve(process.cwd(), "prisma/migrations/20260815060000_harden_admin_transactions/migration.sql"), "utf8");
      await client.query(migration);

      const { rows } = await client.query<{ id: string; enabled: boolean; start: string; end: string | null }>(`
        SELECT "id", "enabled", "startDate"::text AS start, "endDate"::text AS end
        FROM "UserTraineeRelation" ORDER BY "startDate", "id"
      `);
      const effective = rows.filter((row) => row.enabled && row.start <= new Date().toISOString().slice(0, 10) && (!row.end || row.end >= new Date().toISOString().slice(0, 10)));
      expect(effective.map(({ id }) => id)).toEqual(["current"]);
      expect(rows.filter(({ enabled }) => enabled).map(({ id }) => id)).toEqual(["prior", "predecessor", "current", "future-new", "future-later"]);
      const predecessor = rows.find(({ id }) => id === "predecessor");
      expect(predecessor).toMatchObject({ enabled: true });
      expect(predecessor?.end).not.toBeNull();
      expect(predecessor!.end! < rows.find(({ id }) => id === "current")!.start).toBe(true);
      expect(rows.find(({ id }) => id === "current")?.end).not.toBeNull();
      expect(rows.find(({ id }) => id === "future-new")?.end).not.toBeNull();
      expect(rows.filter(({ enabled }) => !enabled).every((row) => row.end !== null && row.end >= row.start)).toBe(true);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
