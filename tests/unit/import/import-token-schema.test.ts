import { describe, expect, it } from "vitest";

import type { ImportPreview } from "@/domain/import/training-plan-schema";
import {
  createImportPreviewToken,
  readImportPreviewToken,
} from "@/server/services/admin-import.service";

describe("signed import preview invariant", () => {
  it("refuses a Day 91 row even before signing an internally supplied preview", () => {
    const invalid = {
      checksum: "invalid-day",
      fileName: "invalid.xlsx",
      rows: [{
        stableImportKey: "EXPLICIT-DAY-091", milestone: null, day: 91, stage: "P4",
        dimension: "Dall", dimensionName: "机台管理", task: "非法任务", action: null,
        drill: null, sortOrder: 1, references: [], referencesAmbiguous: false,
      }],
      items: [],
      counts: { create: 0, update: 0, "disable-candidate": 0, skip: 0, warning: 0, error: 0 },
      canApply: true,
    } as unknown as ImportPreview;

    expect(() => createImportPreviewToken(
      invalid,
      "admin-1",
      "a-secret-longer-than-sixteen",
      { durationDays: 90, revision: 0 },
    )).toThrow();
  });

  it("accepts an extended-day preview only when the signed plan snapshot allows it", () => {
    const extended = {
      checksum: "day-91",
      fileName: "extended.xlsx",
      rows: [{
        stableImportKey: "EXPLICIT-DAY-091", milestone: null, day: 91, stage: "P4",
        dimension: "Dall", dimensionName: "机台管理", task: "扩展任务", action: null,
        drill: null, sortOrder: 1, references: [], referencesAmbiguous: false,
      }],
      items: [{
        classification: "create", stableImportKey: "EXPLICIT-DAY-091",
        row: {
          stableImportKey: "EXPLICIT-DAY-091", milestone: null, day: 91, stage: "P4",
          dimension: "Dall", dimensionName: "机台管理", task: "扩展任务", action: null,
          drill: null, sortOrder: 1, references: [], referencesAmbiguous: false,
        },
      }],
      counts: { create: 1, update: 0, "disable-candidate": 0, skip: 0, warning: 0, error: 0 },
      canApply: true,
    } as ImportPreview;
    const secret = "a-secret-longer-than-sixteen";
    const now = Date.parse("2026-08-16T00:00:00.000Z");

    const token = createImportPreviewToken(
      extended,
      "admin-1",
      secret,
      { durationDays: 91, revision: 3 },
      now,
      "extended-plan-nonce-123456",
    );

    expect(readImportPreviewToken(token, "admin-1", secret, now).trainingPlan).toEqual({
      durationDays: 91,
      revision: 3,
    });
  });
});
