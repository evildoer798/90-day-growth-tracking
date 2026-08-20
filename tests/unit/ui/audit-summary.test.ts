import { describe, expect, it } from "vitest";

import { buildAuditSummary } from "@/features/admin/audit-summary";

describe("training plan settings audit summary", () => {
  it("shows only the safe duration and revision fields", () => {
    expect(buildAuditSummary(
      "TRAINING_PLAN_SETTINGS",
      "UPDATE",
      { id: "default", durationDays: 90, revision: 2, secret: "hidden" },
      { id: "default", durationDays: 91, revision: 3, token: "hidden" },
    )).toEqual({
      before: { id: "default", durationDays: 90, revision: 2 },
      after: { id: "default", durationDays: 91, revision: 3 },
    });
  });
});
