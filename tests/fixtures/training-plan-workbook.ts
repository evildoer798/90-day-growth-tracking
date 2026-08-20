import * as xlsx from "xlsx";

const HEADERS = [
  "Milestone",
  "Day",
  "Stage",
  "Dimension",
  "DimensionName",
  "Task",
  "Reference",
  "ReferenceLink",
  "Action",
  "Drill",
] as const;

const dimensions = ["Dall", "D1", "D2", "D3", "D4"] as const;
const dimensionNames = {
  Dall: "通用能力",
  D1: "方向一",
  D2: "方向二",
  D3: "方向三",
  D4: "方向四",
} as const;

export const trainingPlanTaskName = (day: number): string =>
  day === 1
    ? "新员工入职指引：见导师、主管，认识新同事"
    : `公开测试培养任务 Day ${day}`;

const stageForDay = (day: number): string => {
  if (day <= 30) return "P1";
  if (day <= 60) return "P2";
  if (day <= 80) return "P3";
  return "P4";
};

const rowForDay = (day: number): readonly unknown[] => {
  const dimension = dimensions[(day - 1) % dimensions.length] ?? "Dall";
  const milestone = day === 50 ? "符合上岗要求\n第一次提问题单" : "";
  const reference = day === 8
    ? "公开示例 SOP\n公开示例预约"
    : day === 71
      ? "数量不匹配的示例资料"
      : "";
  const referenceLink = day === 8
    ? "https://example.com/training/sop\nhttps://example.com/training/booking"
    : day === 71
      ? "https://example.com/training/one\nhttps://example.com/training/two"
      : "";

  return [
    milestone,
    day,
    stageForDay(day),
    dimension,
    dimensionNames[dimension],
    trainingPlanTaskName(day),
    reference,
    referenceLink,
    day <= 80 ? `完成第 ${day} 天 Action 示例` : "",
    day <= 23 ? `完成第 ${day} 天 Drill 示例` : "",
  ];
};

export const createTrainingPlanWorkbookBuffer = (): Buffer => {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    [...HEADERS],
    ...Array.from({ length: 90 }, (_, index) => [...rowForDay(index + 1)]),
  ]);
  xlsx.utils.book_append_sheet(workbook, worksheet, "90天学习计划");
  return Buffer.from(xlsx.write(workbook, { bookType: "xlsx", type: "buffer" }));
};
