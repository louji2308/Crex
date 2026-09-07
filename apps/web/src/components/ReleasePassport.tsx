"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface ReleasePassport {
  id: string;
  project_id: string;
  asset_id: string;
  version: number;
  asset_count: number;
  claim_count: number;
  evidence_coverage: number;
  claim_fidelity: number;
  numerical_integrity: number;
  creator_intent_status: "PASS" | "REVIEW" | "BLOCK";
  sponsor_compliance: "PASS" | "REVIEW" | "BLOCK";
  platform_qa: "PASS" | "REVIEW" | "BLOCK";
  overall: number;
  release_status: "DRAFT" | "READY" | "BLOCKED";
  created_at: string;
}

const statusColors = {
  PASS: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  REVIEW: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  BLOCK: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  BLOCKED: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  READY: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  DRAFT: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
};

export function ReleasePassport() {
  const [projectId, setProjectId] = useState("");
  const [assetId, setAssetId] = useState("");

  const { data: passport, isLoading } = useQuery<ReleasePassport | null>({
    queryKey: ["release-passport", projectId, assetId],
    queryFn: async () => {
      const res = await fetch(`/api/passport?projectId=${projectId}&assetId=${assetId}`);
      if (res.status === 404) return null;
      return res.json();
    },
    enabled: !!projectId && !!assetId,
  });

  return (
    <section id="passport" className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Release Passport</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Generate and view the release passport for verified assets
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
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Load Passport
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          Loading passport...
        </div>
      ) : passport ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Release Passport</h3>
                <p className="text-gray-500 dark:text-gray-400">Version {passport.version} • {new Date(passport.created_at).toLocaleString()}</p>
              </div>
              <span className={`px-4 py-2 text-lg font-medium rounded-full ${statusColors[passport.release_status]}`}>
                {passport.release_status}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Overall Score</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{passport.overall}/100</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Assets</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{passport.asset_count}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Claims</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{passport.claim_count}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Evidence Coverage</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{passport.evidence_coverage}%</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Claim Fidelity</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{passport.claim_fidelity}%</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Numerical Integrity</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{passport.numerical_integrity}%</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Platform QA</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{passport.platform_qa}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Compliance Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Creator Intent</p>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[passport.creator_intent_status]}`}>
                  {passport.creator_intent_status}
                </span>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sponsor Compliance</p>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[passport.sponsor_compliance]}`}>
                  {passport.sponsor_compliance}
                </span>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Platform QA</p>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[passport.platform_qa]}`}>
                  {passport.platform_qa}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Export</h3>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(passport, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `passport-${passport.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Download JSON
              </button>
              <button
                onClick={() => {
                  const markdown = generateMarkdown(passport);
                  const blob = new Blob([markdown], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `passport-${passport.id}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Download Markdown
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">Enter Project ID and Asset ID to load the release passport</p>
        </div>
      )}
    </section>
  );
}

function generateMarkdown(passport: ReleasePassport): string {
  return `# Release Passport

**Version:** ${passport.version}
**Created:** ${new Date(passport.created_at).toISOString()}
**Status:** ${passport.release_status}
**Overall Score:** ${passport.overall}/100

## Summary
- **Assets:** ${passport.asset_count}
- **Claims:** ${passport.claim_count}
- **Evidence Coverage:** ${passport.evidence_coverage}%

## Integrity Scores
- **Claim Fidelity:** ${passport.claim_fidelity}%
- **Numerical Integrity:** ${passport.numerical_integrity}%
- **Platform QA:** ${passport.platform_qa}%

## Compliance
- **Creator Intent:** ${passport.creator_intent_status}
- **Sponsor Compliance:** ${passport.sponsor_compliance}
- **Platform QA:** ${passport.platform_qa}

---
*Generated by Crex - AI Content Compiler with Provenance Tracking*
`;
}