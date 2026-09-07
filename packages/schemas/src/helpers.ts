import { randomUUID } from "node:crypto";

export function createId(): string {
  return randomUUID();
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function nowIso(): string {
  return toIso(new Date());
}