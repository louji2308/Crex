import { beforeAll } from "vitest";
import type { D1Migration } from "cloudflare:test";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

const TEST_MIGRATIONS = (
  env as unknown as { TEST_MIGRATIONS: D1Migration[] }
).TEST_MIGRATIONS;

beforeAll(async () => {
  await applyD1Migrations(env.DB, TEST_MIGRATIONS);
});