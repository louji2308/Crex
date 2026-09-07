# Decision: Workflow D1 Migrations Run Wrangler-Side

**Date:** September 7, 2026
**Status:** Approved

---

## Decision

For the Cloudflare Worker (`apps/worker`), D1 database migrations are applied **wrangler-side** (`wrangler d1 migrations apply --migrations-dir ../../packages/db/migrations` run from `apps/worker`), not via `@crex/db`'s `migrate()`. The single source of truth for schema remains `packages/db/migrations/*.sql`; the Worker never calls an in-app migration function on startup.

- `@crex/db`'s `migrate()` stays the local-development / node runner path (used by `packages/db`, `packages/infra` tests).
- Test environments apply the same `packages/db/migrations` directory through the `@cloudflare/vitest-plugin` harness (`readD1Migrations` → `applyD1Migrations`) so the Worker's integration tests exercise real schema.
- Schema evolution stays centralized in `packages/db/migrations/`; no second database definition lives in `apps/worker`.

## Context

The original plan (`decision-async-db-seam.md`) described `@crex/db`'s `migrate()` running inside the Worker as part of the in-app startup path. During Worker C implementation this was re-examined:

1. `@crex/db`'s `src/index.ts` (which exports the migration runner and repositories) imports `node:fs` and `node:path` and therefore cannot be bundled or executed inside the workerd runtime. Deep imports (`@crex/db/src/repositories/workflow-state`) work, but `migrate()` reads `.sql` files from disk — a capability that does not exist in Cloudflare Workers.
2. D1 exposes no file system; migrations must be applied from outside the runtime. Cloudflare's canonical tool is `wrangler d1 migrations apply`.
3. Workflows should not perform schema migrations at runtime: multiple concurrent instances could race on DDL, and a Worker update would otherwise depend on the D1 schema already existing.

## Alternatives considered

1. **Bundle migrations into the Worker and apply at startup.** Rejected: requires `_headers`-style file bundling and an in-app bootstrap with no transactional DDL guarantees; Workflows instances could race; contradicts platform-native wrangler flow.
2. **Put DDL directly in `apps/worker`.** Rejected: duplicates schema definition and violates contract-first engineering; two definitions would drift.
3. **Ignore migrations and require manual D1 setup.** Rejected: not reproducible, violates AGENTS.md reproducibility requirements.

## Reason

Wrangler-side migrations keep schema ownership inside `packages/db/migrations` (one definition), work with Cloudflare's Deployment Protection / CI flows, and avoid runtime schema races. The Worker considers the schema a deployment-time contract, not a runtime responsibility.

## Tradeoffs

- A fresh deployment must run `wrangler d1 migrations apply` before or as part of first deploy; the Worker will fail cleanly (`D1_ERROR` → infra probe false → workflow FAILED) if schema is absent.
- Local `wrangler dev` uses the same `--migrations-dir` flow; developers run migrations before `dev`.

## Consequences

- `apps/worker/wrangler.jsonc` references `database_name: "crex"`; `database_id` is a placeholder (`00000000-...`) until a real D1 database is created and wired.
- `apps/worker/package.json` documents the migration command in `README.md`/`progress.md`.
- The `@cloudflare/vitest-plugin` D1 test recipe guarantees Worker integration tests always run against the current migration set via `readD1Migrations` + `applyD1Migrations`.
- Workers C remaining tasks (L1 worker-bindings config, L2 infra boundary, L3 error model, L4 AiOutput→ProviderResult→WorkflowState alignment) assume wrangler-managed schema.