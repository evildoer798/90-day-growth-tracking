import type { Metric } from "@/domain/progress/types";

export const aggregateMetrics = (metrics: readonly Metric[]): Metric => {
  const totals = metrics.reduce(
    (result, metric) => ({
      numerator: result.numerator + metric.numerator,
      denominator: result.denominator + metric.denominator,
    }),
    { numerator: 0, denominator: 0 },
  );

  return {
    ...totals,
    rate: totals.denominator === 0 ? null : totals.numerator / totals.denominator,
  };
};
