import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

import {
  findActiveReviewerAssignmentsForTrainees,
  findActiveTraineeIdsForUserRole,
} from "@/server/repositories/relation.repository";

describe("relation repository business-date queries", () => {
  it("normalizes Shanghai end-of-day instants before active reviewer queries", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const database = { userTraineeRelation: { findMany } } as never;
    await findActiveReviewerAssignmentsForTrainees(["t1"], new Date("2026-08-15T15:59:59.999Z"), database);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      startDate: { lte: new Date("2026-08-15T00:00:00.000Z") },
      OR: [{ endDate: null }, { endDate: { gte: new Date("2026-08-15T00:00:00.000Z") } }],
    }) }));
  });

  it("normalizes the UTC instant at the Shanghai date boundary for assignment scope", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const database = { userTraineeRelation: { findMany } } as never;
    await findActiveTraineeIdsForUserRole("mentor", "MENTOR", new Date("2026-08-14T16:00:00.000Z"), database);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      startDate: { lte: new Date("2026-08-15T00:00:00.000Z") },
      OR: [{ endDate: null }, { endDate: { gte: new Date("2026-08-15T00:00:00.000Z") } }],
    }) }));
  });
});
