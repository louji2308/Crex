import { runSemanticDriftBenchmark } from "./semantic/semantic-drift.test";
import { runDeterministicBenchmark } from "./deterministic/deterministic.test";
import { runSponsorBenchmark } from "./sponsor/sponsor.test";

console.log("=== Crex Adversarial Benchmark (Wave 16) ===\n");

console.log("Running Semantic Drift Benchmark...");
const semanticResult = runSemanticDriftBenchmark();

console.log("\nRunning Deterministic Benchmark...");
const deterministicResult = runDeterministicBenchmark();

console.log("\nRunning Sponsor Compliance Benchmark...");
const sponsorResult = runSponsorBenchmark();

const totalCases = semanticResult.total + deterministicResult.total + sponsorResult.total;
const totalPassed = semanticResult.passed + deterministicResult.passed + sponsorResult.passed;
const totalFailed = semanticResult.failed + deterministicResult.failed + sponsorResult.failed;

console.log("\n==========================================");
console.log("=== OVERALL BENCHMARK SUMMARY ===");
console.log("==========================================");
console.log(`Total Test Cases: ${totalCases}`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);
console.log(`Overall Pass Rate: ${((totalPassed / totalCases) * 100).toFixed(1)}%`);

console.log("\n--- By Category ---");
console.log(`Semantic Drift: ${semanticResult.passed}/${semanticResult.total} (${((semanticResult.passed / semanticResult.total) * 100).toFixed(1)}%)`);
console.log(`Deterministic: ${deterministicResult.passed}/${deterministicResult.total} (${((deterministicResult.passed / deterministicResult.total) * 100).toFixed(1)}%)`);
console.log(`Sponsor Compliance: ${sponsorResult.passed}/${sponsorResult.total} (${((sponsorResult.passed / sponsorResult.total) * 100).toFixed(1)}%)`);

if (totalFailed > 0) {
  console.log("\n⚠️  Some benchmark cases failed - verification engine needs improvement");
  process.exit(1);
} else {
  console.log("\n✅ All benchmark cases passed - verification engine correctly catches adversarial cases");
  process.exit(0);
}