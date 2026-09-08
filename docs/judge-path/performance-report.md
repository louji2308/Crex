# Judge-Path Performance Report

Generated: 2026-08-20
Worktree: `agent/w20/obs-perf` at `516bf8c`

## Overview

Opt-in timing instrumentation added to every judge-path pipeline stage in the
Crex worker. Timing is **inert by default** — a worker started without
`CREX_PERF=1` runs bit-identical, with zero measurement overhead.

## Instrumentation Architecture

### New Module: `apps/worker/src/perf.ts`

```typescript
withStageTiming<T>(label, fn): Promise<T>   // wrap any stage
collectStageMeasurements(): StageMeasurement[]
resetStageMeasurements(): void
flushStageMeasurements(): void
isPerfEnabled(): boolean                    // process.env.CREX_PERF === "1"
```

`withStageTiming` checks `isPerfEnabled()`; when disabled it returns `fn()`
immediately — no clock reads, no allocations. When enabled it records one
`StageMeasurement` on success or failure:

```typescript
interface StageMeasurement {
  stage: string;        // e.g. "pipeline:verification"
  durationMs: number;   // rounded to 0.1 ms
  startedAt: string;    // ISO 8601
  ok: boolean;          // stage completed without throwing
}
```

### Pipelines Wrapped (all signatures and behavior preserved)

| File | Wrapped stage | Sub-stage |
|------|---------------|-----------|
| `pipelines/video-understanding.ts`  | `pipeline:video-understanding` | `video-understanding:stt-transcribe` (STT API) |
| `pipelines/evidence-graph.ts`       | `pipeline:evidence-graph`     | `evidence-graph:ai-claim-extraction` (AI) |
| `pipelines/generation.ts`           | `pipeline:generation`         | `generation:ai-asset-generation` (AI) |
| `pipelines/verification.ts`         | `pipeline:verification`       | — (deterministic, local) |
| `pipelines/repair.ts`               | `pipeline:repair`             | — (deterministic, local) |
| `pipelines/reverification.ts`       | `pipeline:reverification`     | — (deterministic, local) |
| `pipelines/passport.ts`             | `pipeline:passport`           | — (deterministic, local) |

Note: `runVerification` is also invoked *inside* `reverification`, so a
reverification step records two measurements: the nested
`pipeline:verification` and the outer `pipeline:reverification`.

## Enabling Timing in Production

```bash
CREX_PERF=1 wrangler dev        # local
CREX_PERF=1 wrangler deploy     # deployed worker reads env var at runtime
```

When enabled, stages append to an in-process array; `flushStageMeasurements()`
logs them under the `[crex-perf]` prefix. Measurements are never persisted to
D1, never stored in workflow state, and never affect any decision value.

## Tests

`apps/worker/tests/perf.test.ts` stubs `CREX_PERF=1` inside the vitest pool
and seeds a deterministic scenario, then exercises:

1. `pipeline:verification` — completes, one measurement recorded
2. `pipeline:repair` — completes, one measurement recorded
3. `pipeline:reverification` — completes, `pipeline:reverification` recorded (nested `pipeline:verification` also present)
4. `pipeline:passport` — completes, one measurement recorded
5. Repair -> reverify -> passport round-trip completes well under generous 3 s budget
6. Without `CREX_PERF`, `withStageTiming` adds zero measurements

Run:

```bash
cd apps/worker
pnpm vitest run tests/perf.test.ts
```

## Baseline Expectations (deterministic stages)

Measured in the vitest pool on the demo fixture scale (single asset, few
claims):

| Stage | Expected | Notes |
|-------|----------|-------|
| verification | < 100 ms | pure rule evaluation over claims/evidence |
| repair | < 100 ms | deterministic text transforms |
| reverification | < 200 ms | verify after applying repair actions |
| passport | < 100 ms | compiles runs + provenance + scores |

AI stages (`video-understanding`, `evidence-graph`, `generation`) are
provider/network-bound and are only measurable when a provider is configured in
an integration environment; the automated suite does not issue paid AI calls.

## Limitations

1. Measurement is per-process, in-memory only (no persistence layer).
2. `withStageTiming` measures a stage's full body; cross-stage costs (e.g. DB
   round-trips inside a stage) are not broken out individually.
3. Sub-stage timing exists only for the coarsest external call in the
   AI/STT pipelines, not for every network interaction.
4. The automated perf baseline runs on the miniflare D1 test harness, so
   numbers are indicative of local, not production, performance.