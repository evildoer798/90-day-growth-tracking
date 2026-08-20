const BUSINESS_TIME_ZONE = "Asia/Shanghai";

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Converts an instant to its Asia/Shanghai calendar date, represented as UTC
 * midnight so it can be compared with Prisma `@db.Date` values consistently.
 */
export function toBusinessDate(value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("Invalid business date");
  }

  const parts = Object.fromEntries(
    businessDateFormatter
      .formatToParts(value)
      .filter(({ type }) => type === "year" || type === "month" || type === "day")
      .map(({ type, value: partValue }) => [type, Number(partValue)]),
  );

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function addBusinessDays(value: Date, days: number): Date {
  const result = toBusinessDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
