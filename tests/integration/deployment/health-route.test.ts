import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { $queryRaw: database.queryRaw },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    database.queryRaw.mockReset();
  });

  it("reports healthy only after PostgreSQL answers the probe", async () => {
    database.queryRaw.mockResolvedValue([{ ok: 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(database.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns a minimal non-200 response without leaking database errors", async () => {
    database.queryRaw.mockRejectedValue(
      new Error("password=do-not-leak host=private-db.internal"),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({
      status: "unhealthy",
      database: "unavailable",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).not.toContain("do-not-leak");
    expect(body).not.toContain("private-db.internal");
  });
});
