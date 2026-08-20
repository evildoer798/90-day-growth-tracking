import { describe, expect, it } from "vitest";
import { assessRisk, classifyRisk } from "@/domain/progress/classify-risk";
import type { ProgressSummary } from "@/domain/progress/types";

const summary = (overdueCount: number, dueRate: number | null): ProgressSummary => ({
  learn: { numerator: 0, denominator: 0, rate: null },
  due: { numerator: 0, denominator: dueRate === null ? 0 : 10, rate: dueRate },
  action: { numerator: 0, denominator: 0, rate: null },
  drill: { numerator: 0, denominator: 0, rate: null },
  overdueCount,
  focus: { dimension: "D1", learn: { numerator: 0, denominator: 0, rate: null } },
  dimensions: {
    Dall: { numerator: 0, denominator: 0, rate: null },
    D1: { numerator: 0, denominator: 0, rate: null },
    D2: { numerator: 0, denominator: 0, rate: null },
    D3: { numerator: 0, denominator: 0, rate: null },
    D4: { numerator: 0, denominator: 0, rate: null },
  },
  stages: {
    P1: { numerator: 0, denominator: 0, rate: null },
    P2: { numerator: 0, denominator: 0, rate: null },
    P3: { numerator: 0, denominator: 0, rate: null },
    P4: { numerator: 0, denominator: 0, rate: null },
  },
});

describe("classifyRisk", () => {
  it("marks trainees high risk at five overdue tasks or a due rate below seventy percent", () => {
    expect(classifyRisk(summary(5, 1))).toBe("HIGH_RISK");
    expect(classifyRisk(summary(0, 0.69))).toBe("HIGH_RISK");
  });

  it("marks trainees needing attention at two overdue tasks", () => {
    expect(classifyRisk(summary(2, 0.7))).toBe("ATTENTION");
  });

  it("keeps trainees on track at exact thresholds and when no work is due", () => {
    expect(classifyRisk(summary(1, 0.7))).toBe("ON_TRACK");
    expect(classifyRisk(summary(0, null))).toBe("ON_TRACK");
  });

  it("describes the domain rule that produced a dashboard risk badge", () => {
    expect(assessRisk(summary(5, 1))).toEqual({
      level: "HIGH_RISK",
      reason: "5 项学习任务逾期",
    });
    expect(assessRisk(summary(0, 0.69))).toEqual({
      level: "HIGH_RISK",
      reason: "截至今日完成率低于 70%",
    });
    expect(assessRisk(summary(0, null))).toEqual({
      level: "ON_TRACK",
      reason: "当前没有逾期任务",
    });
  });
});
