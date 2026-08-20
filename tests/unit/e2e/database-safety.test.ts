import { describe, expect, it } from "vitest";

import {
  E2E_DATABASE_URL,
  E2E_RESET_OPT_IN,
  E2E_RESET_OPT_IN_ENV,
  assertE2EDatabaseSafety,
} from "../../../tests/e2e/fixtures/database-safety";

const safeEnvironment = () => ({
  DATABASE_URL: E2E_DATABASE_URL,
  [E2E_RESET_OPT_IN_ENV]: E2E_RESET_OPT_IN,
});

describe("Task 13 destructive database guard", () => {
  it("accepts only the explicitly opted-in dedicated local database", () => {
    expect(() => assertE2EDatabaseSafety(safeEnvironment())).not.toThrow();
  });

  it.each([
    ["missing opt-in", { ...safeEnvironment(), [E2E_RESET_OPT_IN_ENV]: undefined }],
    ["wrong opt-in", { ...safeEnvironment(), [E2E_RESET_OPT_IN_ENV]: "yes" }],
    ["wrong protocol", { ...safeEnvironment(), DATABASE_URL: "postgres://postgres@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public" }],
    ["non-loopback host", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@db.internal:55432/growth_tracking_task13_e2e?schema=public" }],
    ["lookalike loopback host", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.2:55432/growth_tracking_task13_e2e?schema=public" }],
    ["wrong port", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/growth_tracking_task13_e2e?schema=public" }],
    ["lookalike database", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e_copy?schema=public" }],
    ["wrong schema", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e?schema=private" }],
    ["missing schema", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e" }],
    ["unexpected URL parameter", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public&sslmode=require" }],
    ["URL fragment", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public#lookalike" }],
    ["wrong user", { ...safeEnvironment(), DATABASE_URL: "postgresql://growth_app@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public" }],
    ["embedded password", { ...safeEnvironment(), DATABASE_URL: "postgresql://postgres:super-secret@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public" }],
  ])("rejects %s", (_name, environment) => {
    expect(() => assertE2EDatabaseSafety(environment)).toThrow(/Task 13 E2E/);
  });

  it("never includes a supplied password in its rejection", () => {
    const secret = "do-not-print-this-password";
    const operation = () =>
      assertE2EDatabaseSafety({
        ...safeEnvironment(),
        DATABASE_URL: `postgresql://postgres:${secret}@127.0.0.1:55432/growth_tracking_task13_e2e?schema=public`,
      });

    expect(operation).toThrow();
    expect(operation).not.toThrow(secret);
  });
});
