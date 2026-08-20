const roleCodes = new Set(["ADMIN", "SUPERVISOR", "MENTOR", "TRAINEE"]);
const focusGroups = new Set(["D1", "D2", "D3", "D4"]);
const dimensions = new Set(["D1", "D2", "D3", "D4", "Dall"]);
const stages = new Set(["P1", "P2", "P3", "P4"]);
const relationTypes = new Set(["MENTOR", "SUPERVISOR"]);

type JsonRecord = Record<string, unknown>;
type SafeRecord = Record<string, string | number | boolean | null | string[] | SafeRecord[]>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;

const scalar = (source: JsonRecord, target: SafeRecord, key: string, type: "string" | "number" | "boolean") => {
  if (typeof source[key] === type) target[key] = source[key] as string | number | boolean;
};

const nullableString = (source: JsonRecord, target: SafeRecord, key: string) => {
  if (typeof source[key] === "string" || source[key] === null) target[key] = source[key] as string | null;
};

const enumString = (source: JsonRecord, target: SafeRecord, key: string, allowed: Set<string>) => {
  if (typeof source[key] === "string" && allowed.has(source[key])) target[key] = source[key];
};

const roles = (source: JsonRecord, target: SafeRecord) => {
  if (!Array.isArray(source.roles)) return;
  target.roles = [...new Set(source.roles.filter((value): value is string => typeof value === "string" && roleCodes.has(value)))];
};

const references = (source: JsonRecord, target: SafeRecord) => {
  if (!Array.isArray(source.references)) return;
  target.references = source.references.flatMap((value) => {
    const reference = asRecord(value);
    if (!reference || typeof reference.title !== "string" || typeof reference.url !== "string" || !Number.isSafeInteger(reference.sortOrder)) return [];
    return [{ title: reference.title, url: reference.url, sortOrder: reference.sortOrder as number }];
  });
};

const trainee = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  scalar(source, target, "name", "string"); scalar(source, target, "employeeId", "string");
  enumString(source, target, "focusGroup", focusGroups); scalar(source, target, "trainingStartDate", "string");
  if (source.trainingDayOverride === null || Number.isSafeInteger(source.trainingDayOverride)) target.trainingDayOverride = source.trainingDayOverride as number | null;
  scalar(source, target, "enabled", "boolean");
  return target;
};

const user = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  scalar(source, target, "username", "string"); roles(source, target); nullableString(source, target, "traineeId"); scalar(source, target, "enabled", "boolean");
  return target;
};

const passwordReset = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source || source.passwordReset !== true) return null;
  return { passwordReset: true };
};

const relationRecord = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  scalar(source, target, "userId", "string"); scalar(source, target, "traineeId", "string");
  enumString(source, target, "type", relationTypes); scalar(source, target, "isPrimary", "boolean");
  scalar(source, target, "startDate", "string"); nullableString(source, target, "endDate"); scalar(source, target, "enabled", "boolean");
  return target;
};

const relation = (value: unknown): SafeRecord | SafeRecord[] | null => Array.isArray(value)
  ? value.map(relationRecord).filter((item): item is SafeRecord => item !== null)
  : relationRecord(value);

const task = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  scalar(source, target, "stableImportKey", "string"); scalar(source, target, "day", "number");
  enumString(source, target, "stage", stages); enumString(source, target, "dimension", dimensions);
  scalar(source, target, "dimensionName", "string"); scalar(source, target, "sortOrder", "number"); scalar(source, target, "enabled", "boolean");
  references(source, target);
  return target;
};

const imported = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  if (source.event === "TRAINING_PLAN_IMPORTED") target.event = source.event;
  for (const key of ["created", "updated", "disabled", "skipped", "warnings"]) {
    if (Number.isSafeInteger(source[key]) && (source[key] as number) >= 0) target[key] = source[key] as number;
  }
  return target;
};

const trainingPlanSettings = (value: unknown): SafeRecord | null => {
  const source = asRecord(value); if (!source) return null;
  const target: SafeRecord = {};
  scalar(source, target, "id", "string");
  scalar(source, target, "durationDays", "number");
  scalar(source, target, "revision", "number");
  return target;
};

const definitions: Record<string, { actions: Set<string>; side: (value: unknown) => SafeRecord | SafeRecord[] | null }> = {
  TRAINEE: { actions: new Set(["CREATE", "UPDATE", "ENABLE", "DISABLE"]), side: trainee },
  USER: { actions: new Set(["CREATE", "UPDATE", "ENABLE", "DISABLE"]), side: user },
  USER_PASSWORD: { actions: new Set(["UPDATE"]), side: passwordReset },
  REVIEWER_RELATION: { actions: new Set(["UPDATE"]), side: relation },
  TRAINING_TASK: { actions: new Set(["UPDATE", "ENABLE", "DISABLE"]), side: task },
  TRAINING_PLAN_SETTINGS: { actions: new Set(["UPDATE"]), side: trainingPlanSettings },
  TRAINING_PLAN_IMPORTED: { actions: new Set(["IMPORT"]), side: imported },
};

export function buildAuditSummary(entity: string, action: string, before: unknown, after: unknown) {
  const definition = definitions[entity];
  if (!definition?.actions.has(action)) return { before: null, after: null };
  return { before: definition.side(before), after: definition.side(after) };
}

export function normalizeAuditSummary(entity: string, action: string, summary: unknown) {
  const source = asRecord(summary);
  return buildAuditSummary(entity, action, source?.before, source?.after);
}
