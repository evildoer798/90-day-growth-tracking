export const STAGES = {
  1: { code: "P1", label: "入门" },
  2: { code: "P2", label: "筑基" },
  3: { code: "P3", label: "实践" },
  4: { code: "P4", label: "认证" },
} as const;

export type StageNumber = keyof typeof STAGES;
export type Stage = (typeof STAGES)[StageNumber];
export type StageCode = Stage["code"];
export type StageLabel = Stage["label"];
