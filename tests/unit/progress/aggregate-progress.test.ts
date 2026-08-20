import { describe, expect, it } from "vitest";

import { aggregateMetrics } from "@/domain/progress/aggregate-progress";

describe("aggregateMetrics", () => {
  it("weights role dashboard rates by task counts instead of averaging trainee percentages", () => {
    expect(
      aggregateMetrics([
        { numerator: 1, denominator: 1, rate: 1 },
        { numerator: 1, denominator: 3, rate: 1 / 3 },
      ]),
    ).toEqual({ numerator: 2, denominator: 4, rate: 0.5 });
  });

  it("returns a stable unavailable metric for empty scopes and zero denominators", () => {
    expect(aggregateMetrics([])).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(
      aggregateMetrics([
        { numerator: 0, denominator: 0, rate: null },
        { numerator: 0, denominator: 0, rate: null },
      ]),
    ).toEqual({ numerator: 0, denominator: 0, rate: null });
  });
});
