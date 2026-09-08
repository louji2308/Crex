export interface StageMeasurement {
  stage: string;
  durationMs: number;
  startedAt: string;
  ok: boolean;
}

const MEASUREMENTS: StageMeasurement[] = [];

export function isPerfEnabled(): boolean {
  return typeof process !== "undefined" && process.env.CREX_PERF === "1";
}

/**
 * Opt-in stage timing. When `CREX_PERF=1` is set, every pipeline entry and the
 * coarsest external-call sub-stages are measured and appended to an in-memory
 * list. When the flag is unset (the default), the wrapped function runs
 * untouched with zero overhead. Timing never changes behavior or state.
 */
export function withStageTiming<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isPerfEnabled()) {
    return fn();
  }
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const finish = (ok: boolean): void => {
    MEASUREMENTS.push({
      stage: label,
      durationMs: Math.round((performance.now() - start) * 10) / 10,
      startedAt,
      ok,
    });
  };
  return fn().then(
    (value) => {
      finish(true);
      return value;
    },
    (error) => {
      finish(false);
      throw error;
    },
  );
}

export function collectStageMeasurements(): StageMeasurement[] {
  return MEASUREMENTS.map((m) => ({ ...m }));
}

export function resetStageMeasurements(): void {
  MEASUREMENTS.length = 0;
}

export function flushStageMeasurements(): void {
  const measurements = collectStageMeasurements();
  if (measurements.length === 0) {
    return;
  }
  console.log(`[crex-perf] ${measurements.length} stage measurement(s)`);
  for (const m of measurements) {
    console.log(`[crex-perf] ${m.stage}: ${m.durationMs}ms ok=${m.ok} ${m.startedAt}`);
  }
}