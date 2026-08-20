import xlsx from "xlsx";
import { describe, expect, it } from "vitest";

import { buildImportPreview } from "@/domain/import/build-import-preview";
import { parseTrainingPlan } from "@/domain/import/parse-training-plan";
import { calculateProgress } from "@/domain/progress/calculate-progress";
import type {
  ExistingTrainingTask,
  ParsedTrainingPlanRow,
} from "@/domain/import/training-plan-schema";
import { createTrainingPlanWorkbookBuffer } from "../../fixtures/training-plan-workbook";

const readTestWorkbook = async () => createTrainingPlanWorkbookBuffer();

const toExistingTask = (
  row: ParsedTrainingPlanRow,
  overrides: Partial<ExistingTrainingTask> = {},
): ExistingTrainingTask => ({
  id: `existing-${row.day}`,
  stableImportKey: row.stableImportKey,
  milestone: row.milestone,
  day: row.day,
  stage: row.stage,
  dimension: row.dimension,
  dimensionName: row.dimensionName,
  task: row.task,
  action: row.action,
  drill: row.drill,
  sortOrder: row.sortOrder,
  enabled: true,
  references: row.references,
  ...overrides,
  referencesAmbiguous:
    overrides.referencesAmbiguous ?? row.referencesAmbiguous,
});

const makeWorkbook = (headers: readonly string[], rows: readonly unknown[][]) => {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([[...headers], ...rows.map((row) => [...row])]);
  xlsx.utils.book_append_sheet(workbook, worksheet, "90天学习计划");
  return Buffer.from(xlsx.write(workbook, { bookType: "xlsx", type: "buffer" }));
};

describe("parseTrainingPlan", () => {
  it("parses the public-safe generated workbook without importing progress columns", async () => {
    const result = parseTrainingPlan(await readTestWorkbook());

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(90);
    expect(result.rows.filter((row) => row.action !== null)).toHaveLength(80);
    expect(result.rows.filter((row) => row.drill !== null)).toHaveLength(23);
    expect(new Set(result.rows.map((row) => row.dimension))).toEqual(
      new Set(["Dall", "D1", "D2", "D3", "D4"]),
    );
    expect(Object.fromEntries(
      ["Dall", "D1", "D2", "D3", "D4"].map((dimension) => [
        dimension,
        result.rows.filter((row) => row.dimension === dimension).length,
      ]),
    )).toEqual({ Dall: 43, D1: 13, D2: 7, D3: 13, D4: 14 });
    expect(result.rows.find((row) => row.action)?.stableImportKey).not.toBe(
      result.rows.find((row) => row.drill)?.stableImportKey,
    );
    expect(result.rows[0]).toMatchObject({
      stableImportKey: "PLAN_V1-DAY-001",
      day: 1,
      stage: "P1",
      task: "新员工入职指引：见导师、主管，认识新同事",
    });
    expect(result.rows[89]).toMatchObject({
      stableImportKey: "PLAN_V1-DAY-090",
      day: 90,
    });
    expect(result.rows[0]).not.toHaveProperty("done");
    expect(result.rows[0]).not.toHaveProperty("actionDone");
    expect(result.rows[0]).not.toHaveProperty("drillDone");
  });

  it("pairs multiline links with reference titles in their original order", async () => {
    const result = parseTrainingPlan(await readTestWorkbook());
    const dayEight = result.rows.find((row) => row.day === 8);

    expect(dayEight?.references).toEqual([
      {
        title: "公开示例 SOP",
        url: "https://example.com/training/sop",
        sortOrder: 1,
      },
      {
        title: "公开示例预约",
        url: "https://example.com/training/booking",
        sortOrder: 2,
      },
    ]);
    expect(result.rows.find((row) => row.day === 50)?.milestone).toBe(
      "符合上岗要求\n第一次提问题单",
    );
    expect(result.rows.find((row) => row.day === 71)).toMatchObject({
      referencesAmbiguous: true,
      references: [],
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        rowNumber: 72,
        message: expect.stringContaining("no title/URL associations were imported"),
      }),
    );
  });

  it("reports duplicate days instead of guessing keys when no explicit key exists", () => {
    const headers = [
      "Day",
      "Stage",
      "Dimension",
      "DimensionName",
      "Task",
      "Reference",
      "ReferenceLink",
      "Action",
      "Drill",
      "Milestone",
    ];
    const buffer = makeWorkbook(headers, [
      [1, 1, "Dall", "机台管理", "任务一", "", "", "", "", ""],
      [1, 1, "D1", "机械", "任务二", "", "", "", "", ""],
    ]);

    const result = parseTrainingPlan(buffer);

    expect(result.errors).toEqual([
      expect.objectContaining({
        classification: "error",
        message: expect.stringContaining("Day 1"),
      }),
    ]);
    expect(result.rows).toEqual([]);
  });

  it("uses an explicit StableImportKey before the generated day key", () => {
    const headers = [
      "StableImportKey",
      "Day",
      "Stage",
      "Dimension",
      "DimensionName",
      "Task",
      "Reference",
      "ReferenceLink",
      "Action",
      "Drill",
      "Milestone",
    ];
    const buffer = makeWorkbook(headers, [
      ["CUSTOM-ONE", 1, 1, "Dall", "机台管理", "任务一", "", "", " ", "\t", ""],
      ["CUSTOM-TWO", 1, 1, "D1", "机械", "任务二", "", "", "", "", ""],
    ]);

    const result = parseTrainingPlan(buffer);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.stableImportKey)).toEqual([
      "CUSTOM-ONE",
      "CUSTOM-TWO",
    ]);
    expect(result.rows[0]).toMatchObject({ action: null, drill: null });
  });

  it("rejects Day outside 1 through 90 even when an explicit stable key is supplied", () => {
    const headers = [
      "Day",
      "Stage",
      "Dimension",
      "DimensionName",
      "Task",
      "Reference",
      "ReferenceLink",
      "Action",
      "Drill",
      "Milestone",
    ];
    const buffer = makeWorkbook(headers, [
      [91, 4, "Dall", "机台管理", "未来任务", "", "", "", "", ""],
    ]);

    const result = parseTrainingPlan(buffer);

    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        classification: "error",
        rowNumber: 2,
        message: expect.stringMatching(/Day.*90|less than or equal to 90|<=90/i),
      }),
    );

    const explicitResult = parseTrainingPlan(
      makeWorkbook(["StableImportKey", ...headers], [
        [
          "FUTURE-PLAN-DAY-091",
          91,
          4,
          "Dall",
          "机台管理",
          "未来任务",
          "",
          "",
          "",
          "",
          "",
        ],
      ]),
    );
    expect(explicitResult.rows).toEqual([]);
    expect(explicitResult.errors).toContainEqual(expect.objectContaining({
      rowNumber: 2,
      message: expect.stringMatching(/Day.*90|less than or equal to 90/i),
    }));
    expect(() => calculateProgress([], [], 90, "D1")).not.toThrow();
  });

  it("uses the current global plan duration as the Excel Day limit", () => {
    const headers = [
      "Day", "Stage", "Dimension", "DimensionName", "Task", "Reference",
      "ReferenceLink", "Action", "Drill", "Milestone",
    ];
    const day91 = makeWorkbook(headers, [
      [91, 4, "Dall", "机台管理", "扩展任务", "", "", "", "", ""],
    ]);

    expect(parseTrainingPlan(day91, 90).errors).not.toEqual([]);
    expect(parseTrainingPlan(day91, 91)).toMatchObject({
      errors: [],
      rows: [expect.objectContaining({ day: 91, task: "扩展任务" })],
    });
  });

  it("rejects stages outside P1 through P4 before progress calculation", () => {
    const headers = [
      "StableImportKey", "Day", "Stage", "Dimension", "DimensionName", "Task",
      "Reference", "ReferenceLink", "Action", "Drill", "Milestone",
    ];
    const result = parseTrainingPlan(makeWorkbook(headers, [
      ["BAD-STAGE", 1, "P99", "Dall", "机台管理", "非法阶段", "", "", "", "", ""],
    ]));

    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({ rowNumber: 2 }));
    expect(() => calculateProgress([], [], 1, "D1")).not.toThrow();
  });

  it("rejects worksheets that exceed row, column, or cell string limits", () => {
    const headers = [
      "Day", "Stage", "Dimension", "DimensionName", "Task", "Reference",
      "ReferenceLink", "Action", "Drill", "Milestone",
    ];
    const tooManyRows = makeWorkbook(headers, Array.from({ length: 1_001 }, (_, index) => [
      (index % 90) + 1, "P1", "Dall", "机台管理", `任务${index}`, "", "", "", "", "",
    ]));
    const tooManyColumns = makeWorkbook([...headers, ...Array.from({ length: 55 }, (_, index) => `Extra${index}`)], [
      [1, "P1", "Dall", "机台管理", "任务", "", "", "", "", ""],
    ]);
    const tooLongText = makeWorkbook(headers, [
      [1, "P1", "Dall", "机台管理", "x".repeat(10_001), "", "", "", "", ""],
    ]);

    const rowResult = parseTrainingPlan(tooManyRows);
    expect(rowResult.rows).toEqual([]);
    expect(rowResult.errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/行数|row/i) }));

    const columnResult = parseTrainingPlan(tooManyColumns);
    expect(columnResult.rows).toEqual([]);
    expect(columnResult.errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/列数|column/i) }));

    const textResult = parseTrainingPlan(tooLongText);
    expect(textResult.rows).toEqual([]);
    expect(textResult.errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/单元格|cell/i) }));
  });

  it("marks unequal reference counts ambiguous without guessing associations", () => {
    const headers = [
      "Day",
      "Stage",
      "Dimension",
      "DimensionName",
      "Task",
      "Reference",
      "ReferenceLink",
      "Action",
      "Drill",
      "Milestone",
    ];
    const buffer = makeWorkbook(headers, [
      [
        1,
        1,
        "Dall",
        "机台管理",
        "任务一",
        "唯一标题",
        "https://example.test/one\nhttps://example.test/two",
        "",
        "",
        "",
      ],
    ]);

    const result = parseTrainingPlan(buffer);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("no title/URL associations were imported"),
      }),
    ]);
    expect(result.rows[0]).toMatchObject({
      referencesAmbiguous: true,
      references: [],
    });

    const preview = buildImportPreview(result, [
      toExistingTask(result.rows[0], {
        references: [
          { title: "现有资料", url: "https://example.test/existing", sortOrder: 1 },
        ],
      }),
    ]);
    expect(preview.counts).toMatchObject({ skip: 1, update: 0, warning: 1 });
  });
});

describe("buildImportPreview", () => {
  it("classifies creates, updates, disable candidates, and skips explicitly", async () => {
    const parsed = parseTrainingPlan(await readTestWorkbook());
    const unchanged = toExistingTask(parsed.rows[0]);
    const changed = toExistingTask(parsed.rows[1], { action: "旧 Action" });
    const missingEnabled = toExistingTask(parsed.rows[0], {
      id: "missing-enabled",
      stableImportKey: "LEGACY-ENABLED",
    });

    const preview = buildImportPreview(parsed, [unchanged, changed, missingEnabled]);

    expect(preview.counts).toEqual({
      create: 88,
      update: 1,
      "disable-candidate": 1,
      skip: 1,
      warning: 1,
      error: 0,
    });
    expect(preview.items.find((item) => item.stableImportKey === changed.stableImportKey)).toMatchObject({
      classification: "update",
      existingId: changed.id,
    });
    expect(preview.items.find((item) => item.stableImportKey === "LEGACY-ENABLED")).toMatchObject({
      classification: "disable-candidate",
      existingId: "missing-enabled",
    });
  });

  it("carries parser errors into the preview and marks it unsafe to apply", () => {
    const preview = buildImportPreview(
      {
        checksum: "bad-workbook",
        fileName: "training-plan.xlsx",
        rows: [],
        warnings: [],
        errors: [
          {
            classification: "error",
            rowNumber: 2,
            message: "Day 1 is duplicated",
          },
        ],
      },
      [],
    );

    expect(preview.canApply).toBe(false);
    expect(preview.counts.error).toBe(1);
    expect(preview.items).toContainEqual(
      expect.objectContaining({ classification: "error" }),
    );
  });
});
