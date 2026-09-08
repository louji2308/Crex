# Failure-Resilience Report

Generated: 2026-08-20
Worktree: `agent/w20/obs-perf` at `516bf8c`

## Overview

Test matrix covering the failure modes the judge path can hit, verifying that
Crex **surfaces honest status instead of faking success**. New tests live in
`apps/worker/tests/failure-resilience.test.ts`; the matrix below also cites
pre-existing suites (`verification-edge-cases`, `repair-reverification`,
`passport`, `ai-output`, `index.integration`).

## Matrix

### 1. SCOPE_DRIFT — no repair proposed, state stays honest

- **Setup**: claim "Battery testing lasted eleven controlled hours" (no
  qualifiers) + evidence `[12,34]`; component "Unrelated launch announcement".
- **Result (live engine)**: `SCOPE_DRIFT` REVIEW, `run.result === "REVIEW"` (not BLOCK).
- **Repair**: `actions: []` — `computeRepairCandidate` returns `null` for
  `SCOPE_DRIFT` (`repair.ts:141-142`). No fake fix is proposed.
- **Re-verification**: still `SCOPE_DRIFT` REVIEW after zero actions.
- **Existing**: `repair-reverification.test.ts:466` "does not propose a repair
  for a scope drift".

### 2. CONTEXT_REMOVAL — qualifier loss detected deterministically

- **Setup**: claim "Battery lasts approximately 10 hours"; component drops
  "approximately".
- **Result (live engine)**: `CONTEXT_REMOVAL` REVIEW (`verification.ts:239-240`),
  `run.result === "REVIEW"`.
- **Repair**: deterministic repair exists — candidate restores the qualifier
  (`repair.ts:135-136`, `contextRemovalCandidate`).
- **Note**: benchmark fixtures claim BLOCK for this case; the live engine emits
  REVIEW. See `benchmarks/REPORT.md` for the discrepancy.

### 3. Missing claim reference — BLOCK, never silently dropped

- **Existing**: `verification-edge-cases.test.ts:311` — component references a
  nonexistent claim -> `ATTRIBUTION_DRIFT` BLOCK.

### 4. NUMERICAL_DRIFT — BLOCK at and beyond 1 %

- **Existing**: `verification-edge-cases.test.ts` (1 % boundary, 2 % drift,
  precision, rounding); threshold detected by live engine at
  `verification.ts:205-228`.

### 5. SPONSOR_COMPLIANCE — BLOCK when required sponsor content missing

- **Existing**: `verification-edge-cases.test.ts:406-440`; live rule at
  `verification.ts:295-309`. Deterministically repairable
  (`sponsorComplianceCandidate`, `repair.ts:147`).

### 6. AI provider unavailable — explicit error, not fake success

- POST `/evidence-graph/build` with a valid understanding and no provider key ->
  `503 AI_NOT_CONFIGURED`; **no claims are persisted** (verified in
  `failure-resilience.test.ts` — after the 503, `GET /evidence-graph` returns
  `claims: []`).
- **Existing**: `ai-output.test.ts` (unconfigured provider, multi-provider
  fallback), `index.integration.test.ts` `POST /ai/analyze` -> 503.

### 7. Malformed AI output — rejected, nothing carved into DB

- `runGenerationTask` schema-validates provider output; invalid output yields
  `valid: false` / `validation_errors`, and generation throws
  `GENERATION_FAILED` (`generation.ts:89`). The claim/evidence insert loop only
  runs after successful validation, so malformed responses leave no partial
  rows. See `ai-output.test.ts` invalid-output case.

### 8. Terminal workflow instance — never silently restarted

- `transitionPhase` rejects transitions out of `COMPLETED` / `FAILED` /
  `CANCELLED` with `INVALID_WORKFLOW_TRANSITION` (`packages/core/src/workflow.ts:48-52`).
- Covered for all three terminal phases in `failure-resilience.test.ts`.

### 9. Provenance failure — passport never READY

- Signed record + `verification_status INVALID` -> passport **BLOCKED**
  (`passport.ts:223-228`).
- Unresolved provenance (UNSIGNED) -> passport **DRAFT** (`passport.ts:230-231`).
- These require a verification run to exist; without a run the passport is
  DRAFT (`passport.ts:217-219`).
- Covered in `failure-resilience.test.ts`; scoring/status math re-checked in
  `passport.test.ts`.

### 10. BLOCK findings can never produce a READY passport

- Run result BLOCK -> passport BLOCKED regardless of provenance/scoring
  (`passport.ts:220-221`).
- **Existing**: `passport.test.ts:350-362`.

## Coverage Summary

| # | Failure mode | New test | Pre-existing test |
|---|--------------|----------|-------------------|
| 1 | SCOPE_DRIFT no-repair, state honest | ✅ | ✅ repair-reverification |
| 2 | Qualifier loss detected | ✅ | ✅ verification-edge-cases |
| 3 | Missing claim ref -> BLOCK | — | ✅ verification-edge-cases |
| 4 | Numeric drift >= 1 % | — | ✅ verification-edge-cases |
| 5 | Sponsor missing -> BLOCK | — | ✅ verification-edge-cases |
| 6 | AI unconfigured -> 503, no claims | ✅ | ✅ ai-output / index.integration |
| 7 | Malformed AI output rejected | — | ✅ ai-output / generation |
| 8 | Terminal workflow no restart | ✅ | ✅ workflow.ts rule |
| 9 | Provenance fail -> BLOCKED/DRAFT | ✅ | ✅ passport |
| 10 | BLOCK findings -> BLOCKED passport | — | ✅ passport |

## Honest Severity Corrections

During this work the live engine's severities were confirmed and differ from
the `benchmarks/adversarial` fixture expectations:

- `CONTEXT_REMOVAL` and `SCOPE_DRIFT` are **REVIEW** in the engine, not BLOCK.
- Only `ATTRIBUTION_DRIFT`, `NUMERICAL_DRIFT`, `SPONSOR_COMPLIANCE`, and
  `PLATFORM_QA` are BLOCK today.

A passport therefore reaches BLOCKED via numeric drift, sponsor violation,
platform violation, or a signed-but-invalid provenance — never via qualitative
drifts alone, which correctly leave the release in DRAFT (human review).

## Conclusion

All ten failure modes are covered by new and/or pre-existing live-engine
tests. The judge path never fabricates a PASS, never persists partial results
from malformed/AI-failure output, never restarts a terminal workflow, and never
surfaces READY while provenance or verification state is unresolved.