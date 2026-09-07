"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

interface VerificationRun {
  id: string;
  project_id: string;
  asset_id: string;
  engine: string;
  result: "PASS" | "REVIEW" | "BLOCK";
  finding_ids: string[];
  started_at: string;
  completed_at?: string;
}

interface VerificationFinding {
  id: string;
  verification_run_id: string;
  type: string;
  severity: "PASS" | "REVIEW" | "BLOCK";
  reason: string;
  asset_id?: string;
  component_id?: string;
  generated_text?: string;
  source_text?: string;
  evidence_ranges: { start: number; end: number }[];
  recommendation?: string;
  created_at: string;
}

export function VerificationPanel() {
  const [projectId, setProjectId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: runs, isLoading: runsLoading } = useQuery<VerificationRun[]>({
    queryKey: ["verification-runs", projectId, assetId],
    queryFn: async () => {
      const res = await fetch(`/api/verification/runs?projectId=${projectId}&assetId=${assetId}`);
      return res.json();
    },
    enabled: !!projectId && !!assetId,
  });

  const { data: findings, isLoading: findingsLoading } = useQuery<VerificationFinding[]>({
    queryKey: ["verification-findings", selectedRunId],
    queryFn: async () => {
      const res = await fetch(`/api/verification/findings?runId=${selectedRunId}`);
      return res.json();
    },
    enabled: !!selectedRunId,
  });

  const runVerification = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/verification/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assetId }),
      });
      if (!res.ok) throw new Error("Failed to run verification");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate queries to refresh
    },
  });

  const severityColors = {
    PASS: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    REVIEW: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    BLOCK: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  };

  const typeLabels: Record<string, string> = {
    SCOPE_DRIFT: "Scope Drift",
    CERTAINTY_DRIFT: "Certainty Drift",
    CONTEXT_REMOVAL: "Context Removal",
    NUMERICAL_DRIFT: "Numerical Drift",
    ATTRIBUTION_DRIFT: "Attribution Drift",
    SPONSOR_COMPLIANCE: "Sponsor Compliance",
    CREATOR_INTENT: "Creator Intent",
    PLATFORM_QA: "Platform QA",
  };

  return (
    <section id="verify" className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Verification Engine</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Run independent verification on generated assets
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project ID
            </label>
            <input
              id="projectId"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="Project UUID"
            />
          </div>
          <div>
            <label htmlFor="assetId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Asset ID
            </label>
            <input
              id="assetId"
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              placeholder="Asset UUID"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => runVerification.mutate()}
              disabled={runVerification.isPending || !projectId || !assetId}
              className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runVerification.isPending ? "Running..." : "Run Verification"}
            </button>
          </div>
        </div>
      </div>

      {runsLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          Loading verification runs...
        </div>
      ) : runs && runs.length > 0 ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Verification Runs</h3>
            <div className="space-y-3">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedRunId === run.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                      : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Run: {run.id.slice(0, 8)}...</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Engine: {run.engine} • Started: {new Date(run.started_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${severityColors[run.result]}`}
                    >
                      {run.result}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedRunId && findings && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Findings ({findings.length})</h3>
              {findingsLoading ? (
                <p className="text-center text-gray-500 dark:text-gray-400">Loading findings...</p>
              ) : findings.length > 0 ? (
                <div className="space-y-4">
                  {findings.map((finding) => (
                    <div key={finding.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                              {typeLabels[finding.type] || finding.type}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${severityColors[finding.severity]}`}>
                              {finding.severity}
                            </span>
                          </div>
                          <p className="text-gray-900 dark:text-white mb-2">{finding.reason}</p>
                          {finding.generated_text && (
                            <div className="mb-2">
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Generated:</p>
                              <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">{finding.generated_text}</p>
                            </div>
                          )}
                          {finding.source_text && (
                            <div className="mb-2">
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Source:</p>
                              <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">{finding.source_text}</p>
                            </div>
                          )}
                          {finding.recommendation && (
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                <strong>Recommendation:</strong> {finding.recommendation}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-green-600 dark:text-green-400">No findings - verification passed!</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">Enter Project ID and Asset ID to run verification</p>
        </div>
      )}
    </section>
  );
}