import { createHash } from "node:crypto";

import * as xlsx from "xlsx";

import {
  createRawTrainingPlanRowSchema,
  trainingPlanHeaderSchema,
  type ImportIssue,
  type ParsedTaskReference,
  type ParsedTrainingPlan,
  type ParsedTrainingPlanRow,
  type RawTrainingPlanRow,
} from "./training-plan-schema";
import { assertSafeXlsxArchive, XLSX_LIMITS } from "./xlsx-safety";

const TRAINING_PLAN_SHEET = "90天学习计划";
const TRAINING_PLAN_FILE_NAME = "新人90天学习计划_网站导入版.xlsx";

const asText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const normalizeContent = (value: unknown): string | null => {
  const normalized = asText(value).replace(/\r\n?/g, "\n").trim();
  return normalized === "" ? null : normalized;
};

const normalizeMultiline = (value: unknown): string | null => {
  const normalized = asText(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
  return normalized === "" ? null : normalized;
};

const splitNonEmptyLines = (value: unknown): string[] =>
  asText(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part !== "");

const splitReferenceTitles = (value: unknown, expectedCount: number): string[] => {
  const lines = splitNonEmptyLines(value);
  if (lines.length === expectedCount || lines.length !== 1 || expectedCount <= 1) {
    return lines;
  }

  const commaSeparated = lines[0]
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return commaSeparated.length === expectedCount ? commaSeparated : lines;
};

const parseReferences = (
  row: RawTrainingPlanRow,
  rowNumber: number,
  warnings: ImportIssue[],
): { references: ParsedTaskReference[]; referencesAmbiguous: boolean } => {
  const urls = splitNonEmptyLines(row.ReferenceLink);
  const titles = splitReferenceTitles(row.Reference, urls.length);
  const titleText = normalizeContent(row.Reference);

  if (urls.length === 0) {
    if (titleText && titleText !== "—" && titleText !== "-") {
      warnings.push({
        classification: "warning",
        rowNumber,
        message: "Reference title has no ReferenceLink and was not imported",
      });
      return { references: [], referencesAmbiguous: true };
    }
    return { references: [], referencesAmbiguous: false };
  }

  if (titles.length !== urls.length) {
    warnings.push({
      classification: "warning",
      rowNumber,
      message: `Reference title/link count differs (${titles.length}/${urls.length}); no title/URL associations were imported`,
    });
    return { references: [], referencesAmbiguous: true };
  }

  return {
    references: urls.map((url, index) => ({
      title: titles[index] ?? url,
      url,
      sortOrder: index + 1,
    })),
    referencesAmbiguous: false,
  };
};

const issueMessage = (messages: readonly string[]): string => messages.join("; ");

export const parseTrainingPlan = (
  buffer: Buffer,
  maximumDay?: number,
): ParsedTrainingPlan => {
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rawTrainingPlanRowSchema = createRawTrainingPlanRowSchema(maximumDay);

  let workbook: xlsx.WorkBook;
  try {
    assertSafeXlsxArchive(buffer);
    workbook = xlsx.read(buffer, { type: "buffer", raw: true });
  } catch (error: unknown) {
    return {
      checksum,
      fileName: TRAINING_PLAN_FILE_NAME,
      rows: [],
      warnings,
      errors: [
        {
          classification: "error",
          message: `Workbook could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
        },
      ],
    };
  }

  const worksheet = workbook.Sheets[TRAINING_PLAN_SHEET];
  if (!worksheet) {
    return {
      checksum,
      fileName: TRAINING_PLAN_FILE_NAME,
      rows: [],
      warnings,
      errors: [
        {
          classification: "error",
          message: `Missing required sheet: ${TRAINING_PLAN_SHEET}`,
        },
      ],
    };
  }

  const rangeText = worksheet["!ref"];
  if (rangeText) {
    const range = xlsx.utils.decode_range(rangeText);
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    if (rowCount > XLSX_LIMITS.maxWorksheetRows) {
      return { checksum, fileName: TRAINING_PLAN_FILE_NAME, rows: [], warnings, errors: [{ classification: "error", message: `工作表行数超过 ${XLSX_LIMITS.maxWorksheetRows} 限制` }] };
    }
    if (columnCount > XLSX_LIMITS.maxWorksheetColumns) {
      return { checksum, fileName: TRAINING_PLAN_FILE_NAME, rows: [], warnings, errors: [{ classification: "error", message: `工作表列数超过 ${XLSX_LIMITS.maxWorksheetColumns} 限制` }] };
    }
  }
  const worksheetCells = Object.entries(worksheet).filter(([address]) => !address.startsWith("!"));
  if (worksheetCells.length > XLSX_LIMITS.maxWorksheetCells) {
    return { checksum, fileName: TRAINING_PLAN_FILE_NAME, rows: [], warnings, errors: [{ classification: "error", message: `工作表单元格数量超过 ${XLSX_LIMITS.maxWorksheetCells} 限制` }] };
  }
  for (const [, cell] of worksheetCells) {
    const value = (cell as xlsx.CellObject).v;
    if (typeof value === "string" && value.length > XLSX_LIMITS.maxCellTextChars) {
      return { checksum, fileName: TRAINING_PLAN_FILE_NAME, rows: [], warnings, errors: [{ classification: "error", message: `工作表单元格文本超过 ${XLSX_LIMITS.maxCellTextChars} 字符限制` }] };
    }
  }

  const matrix = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const rawHeaders = matrix[0] ?? [];
  const headers = rawHeaders.map((header) => asText(header).trim());
  const headerResult = trainingPlanHeaderSchema.safeParse(headers);
  if (!headerResult.success) {
    return {
      checksum,
      fileName: TRAINING_PLAN_FILE_NAME,
      rows: [],
      warnings,
      errors: [
        {
          classification: "error",
          rowNumber: 1,
          message: issueMessage(headerResult.error.issues.map((issue) => issue.message)),
        },
      ],
    };
  }

  const rows: ParsedTrainingPlanRow[] = [];
  const generatedDays = new Map<number, number>();
  const stableKeys = new Map<string, number>();

  for (const [matrixIndex, values] of matrix.slice(1).entries()) {
    const rowNumber = matrixIndex + 2;
    if (values.every((value) => normalizeContent(value) === null)) {
      continue;
    }

    const rawRecord: Record<string, unknown> = {};
    for (const [columnIndex, header] of headers.entries()) {
      rawRecord[header] = values[columnIndex];
    }
    const rowResult = rawTrainingPlanRowSchema.safeParse(rawRecord);
    if (!rowResult.success) {
      errors.push({
        classification: "error",
        rowNumber,
        message: issueMessage(
          rowResult.error.issues.map(
            (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
          ),
        ),
      });
      continue;
    }

    const rawRow = rowResult.data;
    const explicitKey = normalizeContent(rawRow.StableImportKey);
    const stableImportKey =
      explicitKey ?? `PLAN_V1-DAY-${String(rawRow.Day).padStart(3, "0")}`;

    let duplicateGeneratedDay = false;
    if (!explicitKey) {
      const earlierRow = generatedDays.get(rawRow.Day);
      if (earlierRow !== undefined) {
        duplicateGeneratedDay = true;
        errors.push({
          classification: "error",
          rowNumber,
          stableImportKey,
          message: `Day ${rawRow.Day} is duplicated without an explicit StableImportKey (rows ${earlierRow} and ${rowNumber})`,
        });
      } else {
        generatedDays.set(rawRow.Day, rowNumber);
      }
    }

    const earlierKeyRow = stableKeys.get(stableImportKey);
    if (earlierKeyRow !== undefined && !duplicateGeneratedDay) {
      errors.push({
        classification: "error",
        rowNumber,
        stableImportKey,
        message: `StableImportKey ${stableImportKey} is duplicated (rows ${earlierKeyRow} and ${rowNumber})`,
      });
    } else {
      stableKeys.set(stableImportKey, rowNumber);
    }

    const parsedReferences = parseReferences(rawRow, rowNumber, warnings);
    rows.push({
      stableImportKey,
      milestone: normalizeMultiline(rawRow.Milestone),
      day: rawRow.Day,
      stage: rawRow.Stage,
      dimension: rawRow.Dimension,
      dimensionName: rawRow.DimensionName.trim(),
      task: rawRow.Task.trim(),
      action: normalizeContent(rawRow.Action),
      drill: normalizeContent(rawRow.Drill),
      sortOrder: matrixIndex + 1,
      references: parsedReferences.references,
      referencesAmbiguous: parsedReferences.referencesAmbiguous,
    });
  }

  return {
    checksum,
    fileName: TRAINING_PLAN_FILE_NAME,
    rows: errors.length === 0 ? rows : [],
    warnings,
    errors,
  };
};
