# Judge-Path Test Report

**Task:** W20 Judge-Path Hardening — verify the complete real judge path end-to-end.
**Date:** September 8, 2026
**Agent:** Subagent A (integration test engineer)
**Worktree:** `C:\Users\LOUJAN B\AppData\Local\Temp\opencode\crex-w20-a`
**Branch:** `agent/w20/judge-path`

---

## 1. Baseline (Task 1)

The merged tree (base `516bf8c`) is **GREEN** — no genuine bugs found in baseline.

| Check | Result |
|-------|--------|
| `pnpm -r typecheck` | **PASS** — 11/11 workspaces green |
| `pnpm -r test` | **PASS** — 684/684 tests green (11 test-running workspaces) |

Per-workspace counts:
- `@crex/media` — 29
- `@crex/schemas` — 154
- `apps/web` — 0 (passWithNoTests)
- `@crex/c2pa` — 21 (real signed C2PA path executing)
- `@crex/core` — 20
- `@crex/db` — 67
- `@crex/audience` — 12
- `@crex/ai` — 36
- `@crex/tests` — 106
- `@crex/infra` — 37
- `apps/worker` — 202 (17 files)

**No baseline fixes required.**

---

## 2. Real Judge-Path API Surface (Task 2)

The complete path is wired through `apps/worker/src/index.ts` into stateless HTTP routes backed by real D1. No single "one-shot" source-to-release workflow covers the AI pipeline stages (the Workflows `source-to-release` covers **only** source ingestion → READY, not the AI/verification/passport stages). The deterministic judge path is driven by direct HTTP calls per stage, each persisting real state.

### Endpoint sequence used by the judge-path test

| Stage | Method + Path | Body | Notes |
|-------|---------------|------|-------|
| SOURCE | `POST /sources` + `PUT /sources/:uploadId/blob` + `GET /sources/:uploadId` | `{projectId, fileName}` → binary blob | In tests we seed the source row directly (equivalent to an ingestion-completed READY source) since the source exists as fixture |
| UNDERSTAND | `POST /ai/understand` → `GET /ai/understand/:id` | `{sourceAssetId}` | AI-gated (`AI_NOT_CONFIGURED` without keys); deterministic parts (semantic sections) run real |
| EVIDENCE GRAPH | `POST /evidence-graph/build` | `{understandingId, projectId}` | AI-gated; builds claims + evidence |
| GENERATE | `POST /generate` | `{projectId, assetTypes?}` | AI-gated; runs `runGeneration` real |
| VERIFY | `POST /verify` | `{projectId, assetId}` | **Deterministic, real engine** |
| REPAIR | `POST /repair` + `POST /repair/:id/apply` | `{projectId, assetId, runId?}` | **Deterministic, real engine** |
| RE-VERIFY | `POST /reverify` | `{projectId, assetId, runId?}` | **Deterministic, real engine** (re-runs verification) |
| PASSPORT | `POST /passports` → `GET /passports/:assetId/latest` | `{projectId, assetId}` | **Deterministic, real engine** |

### GAP notes (stages not covered end-to-end by the judge-path test)
- **UNDERSTAND / EVIDENCE GRAPH / GENERATE** are gated behind live AI provider keys (`aiConfigured`). In the deterministic judge-path test these are **not** invoked through HTTP (which would require stubbing fetch at the AI boundary); instead the test seeds the persisted downstream state (claims, evidence, generated asset + component) directly, matching how `verification.test.ts` and `repair-reverification.test.ts` already operate. The **deterministic** stages (VERIFY, REPAIR, RE-VERIFY, PASSPORT) all run 100% real code through HTTP.
- **PROVENANCE** stage exists (`POST /provenance/records`, `GET /provenance/verify`) but is out of scope for this pass's deterministic judge-path test (creates an `UNSIGNED` record that correctly downgrades passport to `DRAFT` — verified via existing `passport.test.ts`).
- **AI calls** may be stubbed at the fetch boundary ONLY where the existing suite already does so (`ai-output.test.ts`). The judge-path test does not stub AI; it bypasses AI-gated stages by seeding persisted state, consistent with the W10-W12 deterministic tests.

---

## 3. Judge-Path E2E Test Results (Task 3 + Task 4)

New file: `apps/worker/tests/judge-path.test.ts` — **10 tests, all PASS**.

Drives the REAL deterministic pipeline through HTTP (`exports.default.fetch` against the miniflare worker harness with real D1 migrations):

| # | Test | Stage(s) | Result | Evidence (assertion) |
|---|------|----------|--------|----------------------|
| 1 | QUALIFIER LOSS → CONTEXT_REMOVAL → REPAIR → RE-VERIFY PASS → PASSPORT reflects PASS | VERIFY → REPAIR → REVERIFY → PASSPORT | **PASS** | `verify.result === "REVIEW"`; `CONTEXT_REMOVAL` finding on qualifier `"approximately"`; repair produces one `PROPOSED` action whose `repaired_text` contains `approximately`; `reverify.result === "PASS"`, `appliedActionCount === 1`; `passport.release_status === "READY"` |
| 2 | Invalid claim reference | VERIFY failure visibility | **PASS** | `verify.result === "BLOCK"`; `ATTRIBUTION_DRIFT` finding severity `BLOCK`, reason contains `does not exist in the evidence graph` |
| 3 | SCOPE_DRIFT cannot be repaired | REPAIR failure visibility | **PASS** | `verify.result === "REVIEW"`; `repair.actions === []` (no deterministic repair for semantic scope drift); `reverify.result === "REVIEW"` with `appliedActionCount === 0` (honest, not silently "fixed") |
| 4 | SPONSOR_COMPLIANCE BLOCK → repair appends sponsor phrase → RE-VERIFY PASS | VERIFY → REPAIR → REVERIFY | **PASS** | `verify.result === "BLOCK"` with `SPONSOR_COMPLIANCE` finding; repair appends `#ad`; `reverify.result === "PASS"`, `appliedActionCount === 1` |
| 5 | Passport requested before verification | PASSPORT failure visibility | **PASS** | No verification run → `passport.release_status === "DRAFT"`, `overall === 70` (conservative, honest unverified state) |
| 6 | Passport after BLOCK verification | PASSPORT failure visibility | **PASS** | After `NUMERICAL_DRIFT` BLOCK → `passport.release_status === "BLOCKED"`, `overall <= 40` (capped) |
| 7 | NUMERICAL_DRIFT BLOCK → repair rewrites number → RE-VERIFY PASS → PASSPORT READY | VERIFY → REPAIR → REVERIFY → PASSPORT | **PASS** | `verify.result === "BLOCK"` (`NUMERICAL_DRIFT`); repair rewrites `$39.99` → `$49.99`; `reverify.result === "PASS"`; `passport.release_status === "READY"`, `overall > 40` |
| 8 | Repair action from wrong project rejected | REPAIR failure visibility | **PASS** | `POST /repair/:id/apply` with wrong projectId → **409** `INVALID_REPAIR_STATE` |
| 9 | Reverify without prior verification run | REVERIFY failure visibility | **PASS** | `POST /reverify` with no prior run → **404** `VERIFICATION_RUN_NOT_FOUND` |
| 10 | Passport for nonexistent asset | PASSPORT failure visibility | **PASS** | `POST /passports` with unknown assetId → **404** `ASSET_NOT_FOUND` |

### Failure-visibility summary (Task 4)

All critical stages fail **visibly and explainably** on bad input:
- **Invalid evidence reference** → `ATTRIBUTION_DRIFT` BLOCK with explicit reason (`does not exist in the evidence graph`).
- **Repair that cannot fix** → SCOPE_DRIFT produces **zero** repair actions (honest, not fabricated); re-verify stays `REVIEW`, applied count 0.
- **Passport before verification passed** → `DRAFT` with `overall=70`, never `READY`.
- **Passport after BLOCK** → `BLOCKED` with score capped at 40.
- **Cross-project / missing-run** misuse → explicit 4xx/409 with precise error codes.

---

## 4. Bugs Found (Task 4)

**No genuine bugs found in the deterministic pipeline.** The initial judge-path test failure (sponsor re-verify returning `REVIEW` instead of `PASS`) was a **test-data artifact**: the claim content and generated component content differed, so on re-verification the engine correctly emitted `SCOPE_DRIFT` REVIEW. The test data was corrected so the claim/component match (and the sponsor phrase is the only discrepancy the engine repairs). This is not a code bug.

---

## 5. Judge-Path Smoke Checklist

A judge or engineer can reproduce the deterministic path with:

```bash
# from the monorepo worktree
pnpm install
pnpm -r typecheck
pnpm -r test

# targeted judge path (miniflare worker harness, real D1)
pnpm --filter @crex/worker test -- judge-path.test.ts

# or run the whole worker suite
pnpm --filter @crex/worker test
```

The judge-path test drives: seed source (READY) → seed claims/evidence → seed generated asset+component → `POST /verify` → `POST /repair` → `POST /reverify` → `POST /passports`, asserting PASS at each deterministic stage.

---

## 6. Known Limitations

- The AI-gated stages (`/ai/understand`, `/evidence-graph/build`, `/generate`) are not exercised through HTTP in the judge-path test because they require provider keys; the deterministic stages they feed (claims/evidence/generated asset) are seeded directly, matching the established W10-W12 test pattern.
- The `source-to-release` Workflow only covers ingestion-to-READY; there is no single HTTP call that drives the full AI pipeline deterministically. The path is a sequence of per-stage calls.
- Provenance (`UNSIGNED` → downgrade to `DRAFT`) is covered by existing `passport.test.ts`, not re-tested here.

---

## 7. Commits Pushed

| Commit | Message |
|--------|---------|
| (pending) | `test: add real judge-path E2E covering verify/repair/reverify/passport` |
| (pending) | `docs: add judge-path test report` |
