"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Claim {
  id: string;
  project_id: string;
  segment_id: string;
  type: string;
  content: string;
  qualifiers: string[];
  created_at: string;
}

interface Evidence {
  id: string;
  claim_id: string;
  type: string;
  content: string;
  source_range: { start: number; end: number };
  created_at: string;
}

export function EvidenceExplorer() {
  const [projectId, setProjectId] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const { data: claims, isLoading: claimsLoading } = useQuery<Claim[]>({
    queryKey: ["claims", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/claims?projectId=${projectId}`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: evidence, isLoading: evidenceLoading } = useQuery<Evidence[]>({
    queryKey: ["evidence", selectedClaimId],
    queryFn: async () => {
      const res = await fetch(`/api/evidence?claimId=${selectedClaimId}`);
      return res.json();
    },
    enabled: !!selectedClaimId,
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <section id="evidence" className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Evidence Graph Explorer</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Browse extracted claims and trace them to timestamped source evidence
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Project ID
        </label>
        <input
          id="projectId"
          type="text"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          placeholder="Enter project UUID"
        />
      </div>

      {claimsLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          Loading claims...
        </div>
      ) : claims && claims.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Claims ({claims.length})</h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {claims.map((claim) => (
                  <button
                    key={claim.id}
                    onClick={() => setSelectedClaimId(claim.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedClaimId === claim.id
                        ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                        : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                        {claim.type}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{claim.content}</p>
                    {claim.qualifiers.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {claim.qualifiers.map((q) => (
                          <span key={q} className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                            {q}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedClaimId ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Supporting Evidence</h3>
                {evidenceLoading ? (
                  <p className="text-center text-gray-500 dark:text-gray-400">Loading evidence...</p>
                ) : evidence && evidence.length > 0 ? (
                  <div className="space-y-4">
                    {evidence.map((e) => (
                      <div key={e.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                            {e.type}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(e.source_range.start)} - {formatTime(e.source_range.end)}
                          </span>
                        </div>
                        <p className="text-gray-900 dark:text-white">{e.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400">No evidence found for this claim</p>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
                <p className="text-gray-500 dark:text-gray-400">Select a claim to view its evidence</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">No claims found. Enter a Project ID to load claims.</p>
        </div>
      )}
    </section>
  );
}