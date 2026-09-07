import { randomUUID } from "node:crypto";
import {
  claimSchema,
  evidenceSchema,
  generatedComponentSchema,
  verificationFindingSchema,
  type Claim,
  type Evidence,
  type GeneratedComponent,
  type VerificationFinding,
  VERIFICATION_STATUS,
  FINDING_TYPE,
} from "@crex/schemas";

export function createId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function baseClaim(overrides: Partial<Claim> = {}): Claim {
  return claimSchema.parse({
    id: createId(),
    project_id: createId(),
    segment_id: createId(),
    type: "CLAIM",
    content: "The laptop battery lasts 10 hours under typical usage.",
    qualifiers: ["approximately", "under typical usage"],
    created_at: nowIso(),
    ...overrides,
  });
}

export function baseEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return evidenceSchema.parse({
    id: createId(),
    claim_id: createId(),
    type: "TRANSCRIPT",
    content: "The laptop battery lasts approximately 10 hours under typical usage.",
    source_range: { start: 120, end: 145 },
    created_at: nowIso(),
    ...overrides,
  });
}

export function baseComponent(overrides: Partial<GeneratedComponent> = {}): GeneratedComponent {
  return generatedComponentSchema.parse({
    component_id: createId(),
    asset_id: createId(),
    content: "Battery life: 10 hours",
    source_references: [],
    claim_references: [],
    constraint_references: [],
    generation_metadata: { engine: "crex-generator-v1", model: "nvidia-test" },
    verification_status: "PASS",
    ...overrides,
  });
}

export function makeFinding(
  type: (typeof FINDING_TYPE)[number],
  overrides: Partial<VerificationFinding> = {}
): VerificationFinding {
  return verificationFindingSchema.parse({
    id: createId(),
    verification_run_id: createId(),
    type,
    severity: "BLOCK",
    reason: `Adversarial test case: ${type}`,
    asset_id: createId(),
    component_id: createId(),
    generated_text: "Battery life: 12 hours",
    source_text: "The laptop battery lasts approximately 10 hours under typical usage.",
    evidence_ranges: [{ start: 120, end: 145 }],
    recommendation: "Align generated content with source evidence",
    created_at: nowIso(),
    ...overrides,
  });
}

export const SEVERITIES = VERIFICATION_STATUS;

export type BenchmarkCase = {
  name: string;
  finding: VerificationFinding;
  expectedSeverity: (typeof VERIFICATION_STATUS)[number];
  description: string;
};

export function runBenchmark(cases: BenchmarkCase[]): {
  total: number;
  passed: number;
  failed: number;
  details: Array<{ name: string; passed: boolean; expected: string; actual: string }>;
} {
  let passed = 0;
  const details: Array<{ name: string; passed: boolean; expected: string; actual: string }> = [];

  for (const c of cases) {
    const actual = c.finding.severity;
    const ok = actual === c.expectedSeverity;
    if (ok) passed++;
    details.push({
      name: c.name,
      passed: ok,
      expected: c.expectedSeverity,
      actual,
    });
  }

  return { total: cases.length, passed, failed: cases.length - passed, details };
}

export function printResults(result: ReturnType<typeof runBenchmark>): void {
  console.log("\n=== Benchmark Results ===");
  console.log(`Total: ${result.total}`);
  console.log(`Passed: ${result.passed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Pass Rate: ${((result.passed / result.total) * 100).toFixed(1)}%`);
  console.log("");

  for (const d of result.details) {
    const status = d.passed ? "✓" : "✗";
    console.log(`${status} ${d.name}: expected ${d.expected}, got ${d.actual}`);
  }
}