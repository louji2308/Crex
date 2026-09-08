# Crex — Security Threat Model

Status: maintained as part of the W17 Security + Reliability audit.
Applies to: the `@crex/worker` Cloudflare Worker, `@crex/db` (D1), `@crex/infra` (R2), and `@crex/core` workflow orchestration.

## 1. Purpose

This document records the security and reliability threat model for the Crex source-to-release pipeline. It is the product of the W17 audit and documents:

- what assets are protected,
- where trust boundaries sit,
- what can go wrong (risk register),
- which controls exist or were added,
- which risks remain for the current prototype.

It does **not** describe code fixes in detail; it links to them.

## 2. In-scope system surface

| Surface | Description |
| --- | --- |
| `POST /sources`, `PUT /sources/:id/blob`, `GET /sources...` | Source media ingestion (session + R2 object + media validation) |
| `POST /workflows/source-to-release`, `GET /workflows/source-to-release/:id` | Workflow creation and status |
| `/ai/analyze` | AI provider invocation (SEMANTIC_UNDERSTANDING) |
| `/contracts`, `/provenance`, `/audience`, `/understand`, `/verification`, `/evidence-graph`, `/generation` | Domain APIs over D1 |
| `SourceToReleaseWorkflow` | Workflows entrypoint: bootstrap, ingest, complete/fail |
| `packages/core/src/workflow.ts` | Workflow state transition logic |
| `packages/infra/src/objectKeys.ts`, `r2.ts`, `d1.ts` | Storage + DB primitives |

Out of scope: `apps/web` browser client (same-origin `/api/*`), AI provider internals, C2PA signing (W19/deployment).

## 3. Assets

| Asset | Store | Sensitivity |
| --- | --- | --- |
| Source media (raw uploads) | R2 `MEDIA` | High (unpublished creator content) |
| Source metadata / checksums / status | D1 `source_upload_sessions`, `source_assets` | Medium |
| Projects, contracts, provenance records, verification runs, workflow state | D1 | Medium |
| AI provider API keys | Worker secrets (`.dev.vars` / `wrangler secret put`) | Critical — never in code, logs, or Git |
| Release deliverables (generated assets) | D1 + downstream | Medium |

## 4. Trust boundaries

1. **Client → Worker** (HTTPS). The client is semi-trusted: it supplies `projectId`, `fileName`, media bytes, and workflow params, all of which are validated. No authentication exists yet (see Residual risks R-1).
2. **Worker → D1 / R2 / Workflows** (platform bindings). Trusted platform boundary; the worker controls all keys, queries, and parameters.
3. **Worker → AI provider**. TLS; the API key travels only in the `Authorization` header.
4. **Workflow code → D1/R2**. The same code path as HTTP, but executed asynchronously; it re-reads the source from R2 and re-validates sizes/checksums.

## 5. Actors

- **Anonymous consumer / attacker** — no auth: may call any public route with arbitrary ids and payloads.
- **Legitimate client UI** (`apps/web`) — fully delegated to the same anonymous surface.
- **Automated attacker** — can enumerate keys (`uploadId`, `projectId`, workflow ids) since several are caller-supplied.
- **Internal components** — workflow runtime, AI provider, platform bindings.

## 6. Risk register

Risks are ranked by likelihood × impact for an **unauthenticated public worker** (current deployment posture).

| # | Risk | Severity | Status |
| --- | --- | --- | --- |
| R1 | **No authentication / authorization on any route.** Multi-tenant data separation relies on per-request `projectId` and on the worker filtering every response by it. There is no tenant identity to bind assets to. | High (High L, High I) | **Residual — prototype limitation**, documented in §8. Data-at-rest is still scoped per project inside D1/R2 (see W17 fixes). |
| R2 | **Workflow state resurrection.** A terminal phase (`COMPLETED`/`FAILED`/`CANCELLED`) could be transitioned back to an active phase, corrupting state or re-running an irrevocable step. | High | **Fixed (W17).** `packages/core/src/workflow.ts` now throws `INVALID_WORKFLOW_TRANSITION` when leaving a terminal phase; unit-tested. Workers still tolerate a *fresh run of a new instance id* by constructing fresh state. |
| R3 | **Error message leakage.** Unhandled non-`CrexError` exceptions (or failure branches that embedded raw messages) could leak internal details (provider errors, stack traces, bucket names) to clients in HTTP bodies. | Medium-High | **Fixed (W17).** `apps/worker/src/http.ts` normalizes non-`CrexError` messages to `{"code":"INTERNAL_ERROR","message":"internal error"}`; `apps/worker/src/sources-routes.ts` wraps upload failures in a fixed `STORAGE_UPLOAD_FAILED`/`"upload failed"` message and logs the raw detail server-side only (`console.error`). Regression-tested. |
| R4 | **Content-length / body-size mismatch handling.** A body longer *or shorter* than the declared `content-length` could leave the upload in an inconsistent state, or surface the raw R2/FixedLength error instead of the intended `413`. | Medium | **Fixed (W17).** Both directions now map to `413 SOURCE_TOO_LARGE` with a fixed message; oversize is also enforced during streaming. Regression-tested. |
| R5 | **Verification-run listing not scoped at the SQL level.** The list endpoint fetched *all* runs then filtered in JS — a caller could see or enumerate other projects' runs (and it defeated index use at scale). | Medium | **Fixed (W17).** Added `VerificationRunRepository.listByProject` (SQL `WHERE project_id = ?`); route now uses it. DB + HTTP regression tests. |
| R6 | **Workflow status endpoint accepted non-canonical instance ids** (e.g. path garbage) and only checked emptiness, weakening key validation on a route that dereferences a platform binding. | Low-Medium | **Fixed (W17).** GET route now requires a canonical UUID → `400 INVALID_WORKFLOW_ID`. Tested. |
| R7 | **Path traversal / object-key construction.** `fileName` from the client flows into an R2 object key. | Medium | **Verified present (no change needed).** `sanitizeFileName` strips traversal/reserved/control characters; keys are `sources/{projectId}/{uploadId}-{safeName}` with UUID components; `R2ObjectStore.put` calls `validateObjectKey` (rejects traversal, control chars, length > 1024). Existing A4 runtime tests cover unsafe filenames. |
| R8 | **SQL injection.** Client strings flow into D1 queries. | High if present | **Verified absent.** Every repository query uses `prepare(...)` with `?` bindings (`D1Adapter`); no string interpolation of client input was found in `packages/db`. |
| R9 | **Checksum / size integrity.** An attacker or a race could store an object that does not match stored metadata, so downstream (workflow ingest, provenance, verification) could operate on wrong bytes. | Medium | **Verified present.** `provenance.verifyAsset` re-hashes the real R2 object; the workflow ingest step re-checks `size_bytes` and re-hashes against `sha256` before `VALID → READY`. |
| R10 | **DoS via oversized/infinite bodies.** Worker memory is limited and bodies are untrusted. | Medium | **Verified present.** Streaming ingestion enforces `SOURCE_MAX_SIZE_BYTES` (default 100 MiB) while hashing; no request is buffered whole except the final object read-back (bounded by the same limit). No rate limiting (residual, see R-2). |
| R11 | **Secrets in repository/artifacts.** AI keys, `.dev.vars`, certs, or signed fixtures could be committed. | Critical if present | **Verified present.** `.gitignore` covers `ca/`, `*.key/*.pem/*.crt/*.csr/*.srl`, `in.png`, `signed.png`, `manifest.json`, `.env`/`.env.*` and `.dev.vars`; `git check-ignore` confirms; `git ls-files` contains no secret-bearing files. Templates (`.env.example`, `apps/worker/.dev.vars.example`) ship with placeholders only. Provisioning uses `wrangler secret put` / local `.dev.vars` (never committed). |
| R12 | **CORS misconfiguration / cross-origin abuse.** A permissive worker-level CORS policy could let hostile pages call the same-origin API. | Medium if added recklessly | **Verified — not applicable today.** The worker sets no CORS headers and the web client calls only relative `/api/*`. If a CORS policy is added later it must be finite and explicit; see §8 item R-3. |
| R13 | **Workflow/state transition abuse via HTTP.** Callers can create workflows with arbitrary ids/payloads, and workflow state rows in D1 are client-influenced only through validated params. | Medium | **Mitigated.** Route-level validation: canonical UUIDs for `projectId`, `id`, `sourceId`; project existence check; workflow code re-validates source ownership and status before ingesting (`INVALID_SOURCE_STATE`). |
| R14 | **AI provider error differentiation.** Treating all provider failures as one error hides rate-limit vs outage vs invalid-input. | Low (reliability) | **Partially mitigated.** AI errors carry distinct codes (`AI_NOT_CONFIGURED` 503, provider failures mapped by `packages/ai/src/errors.ts`); residual improvements (timeout/quota taxonomy) tracked by W18 prosaic coverage. |
| R15 | **Content-type / media validation bypass.** Uploading non-media that passes through to downstream media operations. | Medium | **Mitigated.** Worker validates `fileType` against an allowlist and media via `validateMediaFile`; status must be `VALID` before any workflow ingest. |

## 7. W17 changes (this audit)

| Change | File(s) | Type |
| --- | --- | --- |
| Terminal phases are immutable; `transitionPhase` throws `INVALID_WORKFLOW_TRANSITION` when leaving `COMPLETED`/`FAILED`/`CANCELLED` | `packages/core/src/workflow.ts`, `packages/core/tests/workflow.test.ts` | Fix (`fix(security)`) |
| Non-`CrexError` server errors return generic `INTERNAL_ERROR`/`internal error` | `apps/worker/src/http.ts` | Fix |
| Upload failures are redacted to `STORAGE_UPLOAD_FAILED`/`"upload failed"`; raw detail only in server logs | `apps/worker/src/sources-routes.ts` | Fix |
| Body length mismatch (either direction) → `413 SOURCE_TOO_LARGE`, no internal error leak | `apps/worker/src/sources-routes.ts` | Fix |
| Workflow status GET requires a canonical UUID | `apps/worker/src/index.ts` | Fix |
| Verification runs are scoped per project at the SQL layer | `packages/db/src/repositories/verification-runs.ts`, `apps/worker/src/verification-routes.ts` | Fix |
| Regression + adversarial tests for all of the above (incl. worker boundary, DB, core) | `apps/worker/tests/security.test.ts`, `apps/worker/tests/http.test.ts`, `apps/worker/tests/source-ingestion.test.ts`, `packages/db/tests/repositories.test.ts`, `packages/core/tests/workflow.test.ts` | Test (`test(security)`) |
| This document | `docs/security/threat-model.md` | Docs (`docs(security)`) |

## 8. Residual risks and prototype limitations

- **R-1 No authentication.** The worker trusts the caller-supplied `projectId`. Data is scoped at the SQL/storage layer and every list/detail route filters by a validated project id, but a determined caller can still read any tenant's data by supplying that tenant's `projectId`. **Decision deferred**: the product intentionally has no auth in its current prototype (per orchestration). Add an auth boundary (platform access control / JWT gateway) before any real multi-tenant deployment.
- **R-2 No rate limiting / quota.** Unlimited concurrent uploads/workflow creations are possible. The on-worker size limits bound per-request cost; platform-level throttling is not configured. Acceptable for prototype; revisit before public exposure.
- **R-3 CORS is unset** (no cross-origin policy exists today; same-origin client only). Any future CORS policy must be explicit and narrow. Documented, not implemented, by design.
- **R-4 Unbounded JSON bodies** on non-upload POSTs (e.g. `/ai/analyze`). Bounded in practice by platform payload size; no custom cap. Low risk for prototype.
- **R-5 Full `pnpm -r test`** is currently gated by pre-existing `@crex/c2pa` environment-drift failures (in scope for W18). W17 packages (`core`, `db`, `worker`) are green.

## 9. Security review checklist state

- [x] No secrets committed; `.gitignore` covering all secret artifacts verified (`git check-ignore`, `git ls-files`).
- [x] SQL injection audit (all queries parameterized).
- [x] Path traversal / object key construction reviewed.
- [x] Content-size controls present and hardened (both mismatch directions).
- [x] Checksum integrity re-verified on ingest and verify paths.
- [x] Workflow state machine hardened (no terminal resurrection).
- [x] Error responses redacted.
- [x] Cross-project data scoping verified at SQL layer and regressed.
- [ ] Authentication (deferred) — see R-1.
- [ ] Rate limiting (deferred) — see R-2.