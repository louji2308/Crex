"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

interface SourceAsset {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  duration_seconds: number;
  status: string;
  created_at: string;
}

export function SourceUpload() {
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: sources } = useQuery<SourceAsset[]>({
    queryKey: ["sources", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/sources?projectId=${projectId}`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !projectId) throw new Error("Missing file or project ID");
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      const res = await fetch("/api/sources", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onMutate: () => {
      setUploadProgress(0);
      setError(null);
    },
    onSuccess: (data) => {
      setUploadProgress(100);
      setSuccess(`Source uploaded: ${data.file_name} (${data.id})`);
      setFile(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setUploadProgress(0);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!projectId) {
      setError("Please enter a Project ID");
      return;
    }
    if (!file) {
      setError("Please select a file");
      return;
    }
    uploadMutation.mutate();
  };

  return (
    <section id="upload" className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Upload Source Media</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Upload your source video for analysis and evidence extraction
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div>
          <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Project ID *
          </label>
          <input
            id="projectId"
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter project UUID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Source Video File
          </label>
          <input
            type="file"
            id="videoFile"
            accept="video/*"
            onChange={handleFileChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          {file && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {uploadMutation.isPending && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Upload Progress: {uploadProgress}%
            </label>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploadMutation.isPending || !file || !projectId}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadMutation.isPending ? "Uploading..." : "Upload Source"}
        </button>
      </div>

      {projectId && sources && sources.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Project Sources</h3>
          <div className="space-y-3">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{source.file_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {source.file_type} • {(source.size_bytes / 1024 / 1024).toFixed(2)} MB • {source.duration_seconds}s
                  </p>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    source.status === "READY"
                      ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                      : source.status === "FAILED"
                      ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                      : "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
                  }`}
                >
                  {source.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}