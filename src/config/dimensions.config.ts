export const DIMENSIONS = {
  Dall: { name: "机台管理", shortName: "机台管理" },
  D1: { name: "机械运动", shortName: "机械" },
  D2: { name: "光路光源", shortName: "光路" },
  D3: { name: "传感器与测校", shortName: "传感" },
  D4: { name: "平台功能", shortName: "平台" },
} as const;

export type DimensionCode = keyof typeof DIMENSIONS;
export type Dimension = (typeof DIMENSIONS)[DimensionCode];
export type DimensionName = Dimension["name"];
export type DimensionShortName = Dimension["shortName"];
