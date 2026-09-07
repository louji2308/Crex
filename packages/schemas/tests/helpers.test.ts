import { describe, expect, it } from "vitest";
import {
  createId,
  idSchema,
  isoDateTimeSchema,
  nowIso,
  toIso,
  uuidSchema,
} from "../src/index";

describe("createId", () => {
  it("returns a valid UUID string", () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(() => uuidSchema.parse(id)).not.toThrow();
    expect(() => idSchema.parse(id)).not.toThrow();
  });

  it("returns a unique value across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });
});

describe("nowIso", () => {
  it("returns a valid UTC ISO 8601 datetime", () => {
    const value = nowIso();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(value).toISOString()).toBe(value);
    expect(() => isoDateTimeSchema.parse(value)).not.toThrow();
  });
});

describe("toIso", () => {
  it("formats a Date as UTC ISO 8601", () => {
    const date = new Date("2026-09-07T10:00:00.000Z");
    expect(toIso(date)).toBe("2026-09-07T10:00:00.000Z");
  });

  it("converts local instants to UTC", () => {
    const date = new Date("2026-09-07T13:00:00+03:00");
    expect(toIso(date)).toBe("2026-09-07T10:00:00.000Z");
  });
});

describe("isoDateTimeSchema", () => {
  it.each([
    ["a non-UTC offset", "2026-09-07T10:00:00.000+02:00"],
    ["a missing UTC designator", "2026-09-07T10:00:00.000"],
    ["a space separator", "2026-09-07 10:00:00.000Z"],
    ["an invalid calendar date", "2026-02-30T10:00:00.000Z"],
    ["plain text", "not-a-date"],
  ])("rejects %s", (_label, input) => {
    expect(() => isoDateTimeSchema.parse(input)).toThrow();
  });
});

describe("uuidSchema", () => {
  it.each([
    ["a non-uuid string", "not-a-uuid"],
    ["too few groups", "12345678-1234-1234-1234"],
    ["non-hex characters", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"],
  ])("rejects %s", (_label, input) => {
    expect(() => uuidSchema.parse(input)).toThrow();
  });
});