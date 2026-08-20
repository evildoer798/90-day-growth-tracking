import { describe, expect, it } from "vitest";
import { calculateCurrentDay } from "@/domain/progress/calculate-current-day";

describe("calculateCurrentDay", () => {
  it("counts the training start date as day one", () => {
    expect(
      calculateCurrentDay({
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
        today: new Date("2026-01-01T18:00:00.000Z"),
        trainingDayOverride: null,
        durationDays: 90,
      }),
    ).toBe(1);
  });

  it("clamps dates before training to day zero and late dates to day ninety", () => {
    const trainingStartDate = new Date("2026-01-10T00:00:00.000Z");

    expect(calculateCurrentDay({ trainingStartDate, today: new Date("2026-01-09T00:00:00.000Z"), trainingDayOverride: null, durationDays: 91 })).toBe(0);
    expect(calculateCurrentDay({ trainingStartDate, today: new Date("2026-04-15T00:00:00.000Z"), trainingDayOverride: null, durationDays: 91 })).toBe(91);
  });

  it("uses a clamped training-day override in preference to calendar dates", () => {
    expect(
      calculateCurrentDay({
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
        today: new Date("2026-01-01T00:00:00.000Z"),
        trainingDayOverride: 34,
        durationDays: 91,
      }),
    ).toBe(34);
    expect(
      calculateCurrentDay({
        trainingStartDate: new Date("2026-01-01T00:00:00.000Z"),
        today: new Date("2026-01-01T00:00:00.000Z"),
        trainingDayOverride: 120,
        durationDays: 91,
      }),
    ).toBe(91);
  });
});
