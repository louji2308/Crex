# Adversarial Benchmark Report

Generated: 2026-08-20
Worktree: `agent/w20/obs-perf` at `516bf8c`

## Summary

```
Total:  33/33 PASS  (fixture self-consistency)
```

| Category              | Cases | Result |
|-----------------------|-------|--------|
| Semantic Drift        | 11    | 11/11 pass |
| Deterministic (numeric) | 11  | 11/11 pass |
| Sponsor Compliance    | 11    | 11/11 pass |

## Verdict: Benchmark Suite Validates Fixtures, NOT the Live Engine

**Critical finding:** the `benchmarks/adversarial` suite does **not** invoke the
Crex verification engine. Each case in `semantic-drift.test.ts`,
`deterministic.test.ts`, and `sponsor.test.ts`:

1. Constructs a `VerificationFinding` fixture via `makeFinding(...)` (severity
   hardcoded to `"BLOCK"` in `benchmarks/adversarial/common.ts:70`).
2. Asserts `c.finding.severity === c.expectedSeverity` — i.e. **fixture field
   vs. fixture field** (`runBenchmark` at `common.ts:102`).

Because `makeFinding` defaults severity to `"BLOCK"` and every case sets
`expectedSeverity: "BLOCK"`, all 33 cases pass trivially. The suite is a
schema/fixture consistency harness, not an executable adversarial benchmark of
the verifier.

This means `progress.md` line claims like the W20 task description's
"37/40 cases detected" cannot be reproduced from `benchmarks/adversarial`
alone. Live detections come from these real coverage suites:

| Suite | Validates |
|-------|-----------|
| `apps/worker/tests/verification-edge-cases.test.ts` | real engine: ATTRIBUTION_DRIFT, NUMERICAL_DRIFT, CONTEXT_REMOVAL, SCOPE_DRIFT, sponsor, platform |
| `apps/worker/tests/repair-reverification.test.ts` | real engine: repair, apply, reverify loop |
| `apps/worker/tests/failure-resilience.test.ts` | real engine + routes under failure modes |
| `apps/worker/tests/passport.test.ts` | real release-status computation |
| `apps/worker/tests/index.integration.test.ts` | live workflow lifecycle |

## Severity Discrepancy: Benchmark vs. Live Engine

The benchmark fixtures claim `BLOCK` for semantic drifts, but the live engine
(measured via the real route in this worktree) emits different severities:

| Finding type                | Benchmark fixture | Live engine (`verification.ts`) |
|-----------------------------|-------------------|-------------------------------|
| CONTEXT_REMOVAL (qualifier) | BLOCK             | REVIEW (`verification.ts:240`) |
| SCOPE_DRIFT                 | BLOCK             | REVIEW (`verification.ts:260`) |
| CERTAINTY_DRIFT             | BLOCK             | (no such finding produced today; only via `makeFinding`) |
| ATTRIBUTION_DRIFT (missing) | BLOCK             | BLOCK (`verification.ts:193`) |
| NUMERICAL_DRIFT             | BLOCK             | BLOCK (`verification.ts:217`) |
| SPONSOR_COMPLIANCE (required missing) | BLOCK  | BLOCK (`verification.ts:303`) |

**Recommendation:** either (a) convert `benchmarks/adversarial` into live-engine
tests that call `runVerification` with seeded claims/evidence (matching the
very fast `verification-edge-cases.test.ts` pattern) and assert the engine's
real severities; or (b) drop the adversarial fixtures from the "detection"
narrative in `progress.md` and rely on the worker suites. Until then, the
benchmark numbers must not be presented as engine detection rates.

## Real Detection Coverage (from live-engine suites)

- Missing claim reference -> `ATTRIBUTION_DRIFT` BLOCK
- Numeric drift (1%, 2%, precision, rounding, unit, threshold, boundary) -> `NUMERICAL_DRIFT` BLOCK
- Qualifier removed -> `CONTEXT_REMOVAL` REVIEW
- Keyword drift / scope inflation -> `SCOPE_DRIFT` REVIEW
- Missing required sponsor phrase/disclosure/URL -> `SPONSOR_COMPLIANCE` BLOCK
- Platform title/description limits -> `PLATFORM_QA` BLOCK

## Verification Commands

```bash
# Run the fixture-consistency suite (from worktree root via junction):
node benchmarks\node_modules\vitest\vitest.mjs run

# Run the live-engine suites:
cd apps/worker && pnpm test
```

## Conclusion

The 33/33 pass is real but limited: it certifies fixture shape, not engine
behavior. The live-engine adversarial behavior is covered by the worker suites
listed above. Do not cite `benchmarks/adversarial` results as evidence of
verifier detection without first converting it to invoke the engine.