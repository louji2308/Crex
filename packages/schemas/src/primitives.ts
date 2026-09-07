import { z } from "zod";

export const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  { message: "expected a canonical UUID string" },
);

export const idSchema = uuidSchema;

const ISO_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{3})?Z$/;

function isValidIsoUtcDateTime(value: string): boolean {
  const match = ISO_DATETIME_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const second = Number(secondPart);
  if (!IntegerRangeCheck(month, 1, 12)) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!IntegerRangeCheck(day, 1, daysInMonth)) {
    return false;
  }
  if (!IntegerRangeCheck(hour, 0, 23)) {
    return false;
  }
  if (!IntegerRangeCheck(minute, 0, 59)) {
    return false;
  }
  if (!IntegerRangeCheck(second, 0, 60)) {
    return false;
  }
  if (second > 59 && minute !== 59) {
    return false;
  }
  return true;
}

function IntegerRangeCheck(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export const isoDateTimeSchema = z
  .string()
  .regex(ISO_DATETIME_PATTERN, {
    message: "expected an ISO 8601 UTC datetime string",
  })
  .refine(isValidIsoUtcDateTime, {
    message: "expected a valid ISO 8601 datetime",
  });

export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, { message: "expected a lowercase SHA-256 hex digest" });

export const scoreSchema = z.number().int().min(0).max(100);

export const sourceRangeSchema = z
  .strictObject({
    start: z.number().min(0),
    end: z.number().min(0),
  })
  .refine((range) => range.start <= range.end, {
    message: "start must not be greater than end",
  });