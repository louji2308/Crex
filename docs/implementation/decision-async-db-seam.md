# Decision: Async Database Seam + Cloudflare D1/R2 Adapters

**Date:** September 7, 2026
**Status:** Approved

---

## Decision

The `@crex/db` database seam is converted from synchronous to asynchronous (Promise-based), and real Cloudflare D1 and R2 adapters are implemented in `@crex/infra` so repository code runs unchanged over both local SQLite and Cloudflare D1.

- `SqlStatement.run/get/all` and `SqlDb.exec/close` now return Promises.
- `SqlDb.prepare(sql)` stays synchronous (statement preparation is cheap and matches D1's synchronous construction).
- `SqlDb.batch(statements: SqlBatchItem[])` is added as a required method. `migrate()` uses a single `batch()` call as its only code path for both backends.
- `isOpen` remains on `SqlDb` (tests rely on it) and is always `true` for the D1 adapter.
- `D1Adapter` implements `SqlDb` over a minimal structural `D1DatabaseBinding` interface (no `@cloudflare/workers-types` import).
- `R2ObjectStore` wraps a minimal structural `R2BucketBinding` interface with key-path safety validation, metadata handling, and multipart upload support.
- Both adapters are validated by tests running against the `miniflare` (workerd) emulation.

## Context

Crex is deployed on Cloudflare (D1 for relational data, R2 for media). The existing `@crex/db` package used `node:sqlite` with a synchronous API. Cloudflare D1's client API (`prepare().bind().run()/all()/first()` and `batch()`) is entirely Promise-based. A synchronous seam cannot be implemented over D1, so the repositories (`packages/db/src/repositories/*`) and the migration runner (`packages/db/src/migrations.ts`) could not run on the deployed stack. One seam had to be chosen, and deployment on D1 requires the async shape.

D1 provides no transaction control (no `BEGIN`/`COMMIT`); `batch()` is D1's atomic execution unit, and `prepare().bind()` is the only parameter-binding mechanism. R2 exposes a Promise-based object-store API with its own multipart-upload flow.

## Alternatives considered

1. **Keep `@crex/db` synchronous; run a hosted SQLite proxy.** Rejected: contradicts the approved Cloudflare D1 architecture, adds infrastructure and latency, and D1 is already the platform-native database per `Architecture/` and `Techstack.md`.
2. **Two parallel repository layers (sync for local, async for D1).** Rejected: doubles the contract surface and violates contract-first engineering; drift risk is unacceptable.
3. **Bifurcate `SqlDb` with optional async methods.** Rejected: optional seams hide which backend an implementation actually supports and produce unchecked runtime errors.
4. **Add `batch()` only to D1, keep migrations backend-specific.** Rejected: two migration code paths would diverge; the checksum/bookkeeping logic is identical and should live in one place.
5. **Import `@cloudflare/workers-types` for adapter types.** Rejected: it couples `@crex/infra` to a type-only dependency that is unavailable outside the Workers runtime and complicates local testing. Structural minimal interfaces keep the adapters runtime-neutral and testable with miniflare.

## Reason

- The async seam is the smallest change that makes every repository usable on both node:sqlite and D1.
- `SqlDb.batch()` is required because D1's atomic unit is `batch()`, and making migrations use it everywhere preserves a single migration path that is atomic on SQLite (BEGIN/COMMIT inside `SqliteDatabase.batch`) and D1 (`D1Database.batch`).
- The D1 adapter maps D1 semantics onto the seam: `run().meta` → `{ changes, last_insert_rowid }`, `first()` → `get()` (null treated as `undefined`), `all().results` → `get()/all()` rows, and `prepare(...).bind(...params)` for parameterized statements.
- The R2 store is thin and safety-first: object keys are validated against traversal/absolute/control-character attacks, `contentType` is mandatory and stored in `httpMetadata`, checksums ride in `customMetadata`, and multipart parts are validated (1–10000, ≥5 MiB except the final part).

## Tradeoffs

- Node `node:sqlite`'s synchronous operations now execute inside `async` methods; synchronous throws surface as rejected promises. Callers must `await` and error assertions use `expect(...).rejects`.
- `batch()` replaces explicit transaction control in migrations: SQLite's `BEGIN`/`COMMIT` is hidden behind the seam, and D1's `batch()` cannot be interrupted mid-transaction by application code.
- D1 returns `last_row_id` as a plain number; SQLite's `lastInsertRowid` is `number | bigint`. The seam type accommodates both.
- D1 numbers are JS `number`s; large `INTEGER` values lose precision beyond `Number.MAX_SAFE_INTEGER` (not used by current schemas — ids are TEXT UUIDs).
- `close()` is a no-op on D1 (bindings are stateless proxies).

## Consequences

- All repositories and the migration runner are now async; every consumer of `@crex/db` must `await` (worker, tests, fixtures).
- `packages/db` tests (adapter, migrations, repositories, integration) and `tests/` (db-integration, helpers/memory-db) were migrated to `async/await`.
- `packages/infra` now provides `D1Adapter`, `R2ObjectStore`, `R2MultipartUpload`, and `sourceAssetObjectKey`/`sanitizeFilename`/`validateObjectKey`, with miniflare-backed tests proving real migrations, prepared statements, batch atomicity, R2 round-trips, and multipart uploads against the workerd emulation.
- Future work: the worker can construct `D1Adapter(binding)` at runtime and build `R2ObjectStore(bucket)` for upload handling; local development keeps using `createSqlDb(location)`.