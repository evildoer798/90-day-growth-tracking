import type {
  ExistingTrainingTask,
  ImportClassification,
  ImportPreview,
  ImportPreviewCounts,
  ImportPreviewItem,
  ParsedTrainingPlan,
  ParsedTrainingPlanRow,
} from "./training-plan-schema";

const emptyCounts = (): ImportPreviewCounts => ({
  create: 0,
  update: 0,
  "disable-candidate": 0,
  skip: 0,
  warning: 0,
  error: 0,
});

const comparableTask = (
  task: ParsedTrainingPlanRow | ExistingTrainingTask,
): Omit<ParsedTrainingPlanRow, "referencesAmbiguous"> => ({
  stableImportKey: task.stableImportKey,
  milestone: task.milestone,
  day: task.day,
  stage: task.stage,
  dimension: task.dimension,
  dimensionName: task.dimensionName,
  task: task.task,
  action: task.action,
  drill: task.drill,
  sortOrder: task.sortOrder,
  references: task.references.map(({ title, url, sortOrder }) => ({
    title,
    url,
    sortOrder,
  })),
});

const tasksMatch = (
  row: ParsedTrainingPlanRow,
  existing: ExistingTrainingTask,
): boolean => {
  const imported = comparableTask(row);
  const current = comparableTask(existing);
  return existing.enabled && JSON.stringify({
    ...imported,
    references: row.referencesAmbiguous
      ? current.references
      : imported.references,
  }) === JSON.stringify(current);
};

const pushItem = (
  items: ImportPreviewItem[],
  counts: ImportPreviewCounts,
  item: ImportPreviewItem,
) => {
  items.push(item);
  counts[item.classification] += 1;
};

export const buildImportPreview = (
  parsed: ParsedTrainingPlan,
  existingTasks: readonly ExistingTrainingTask[],
  maximumActiveDay = Number.MAX_SAFE_INTEGER,
): ImportPreview => {
  const items: ImportPreviewItem[] = [];
  const counts = emptyCounts();
  const existingByKey = new Map(existingTasks.map((task) => [task.stableImportKey, task]));
  const importedKeys = new Set(parsed.rows.map((row) => row.stableImportKey));

  for (const row of parsed.rows) {
    const existing = existingByKey.get(row.stableImportKey);
    if (!existing) {
      pushItem(items, counts, {
        classification: "create",
        stableImportKey: row.stableImportKey,
        row,
      });
      continue;
    }

    const classification: ImportClassification = tasksMatch(row, existing)
      ? "skip"
      : "update";
    pushItem(items, counts, {
      classification,
      stableImportKey: row.stableImportKey,
      existingId: existing.id,
      row,
      before: existing,
    });
  }

  for (const existing of existingTasks) {
    if (
      !importedKeys.has(existing.stableImportKey) &&
      existing.enabled &&
      existing.day <= maximumActiveDay
    ) {
      pushItem(items, counts, {
        classification: "disable-candidate",
        stableImportKey: existing.stableImportKey,
        existingId: existing.id,
        before: existing,
      });
    }
  }

  for (const issue of [...parsed.warnings, ...parsed.errors]) {
    pushItem(items, counts, {
      classification: issue.classification,
      stableImportKey: issue.stableImportKey,
      message: issue.message,
    });
  }

  return {
    checksum: parsed.checksum,
    fileName: parsed.fileName,
    rows: parsed.rows,
    items,
    counts,
    canApply: counts.error === 0,
  };
};
