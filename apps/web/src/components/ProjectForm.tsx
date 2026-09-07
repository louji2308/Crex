"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { projectSchema } from "@crex/schemas";
import { z } from "zod";

const createProjectSchema = projectSchema.omit({ id: true, created_at: true, updated_at: true });

type ProjectFormData = z.infer<typeof createProjectSchema>;

export function ProjectForm() {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: "",
    description: "",
    target_platforms: ["YOUTUBE"],
    audience: {
      summary: "",
      interests: [],
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createProject = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to create project");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setSuccess(`Project created: ${data.name} (${data.id})`);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validated = createProjectSchema.safeParse(formData);
    if (!validated.success) {
      setError("Invalid form data: " + validated.error.message);
      return;
    }
    createProject.mutate(validated.data);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name === "target_platforms") {
      const select = e.target as HTMLSelectElement;
      const values = Array.from(select.selectedOptions).map((o) => o.value);
      setFormData((prev) => ({ ...prev, target_platforms: values }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const platforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "OTHER"];

  return (
    <section id="project" className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Project</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Define your content project with target platforms and audience
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

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Project Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="My Laptop Review"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Laptop review for ProBook X1 with battery testing"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Target Platforms *
          </label>
          <select
            name="target_platforms"
            multiple
            value={formData.target_platforms}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hold Ctrl/Cmd to select multiple</p>
        </div>

        <div>
          <label htmlFor="audience_summary" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Audience Summary
          </label>
          <input
            id="audience_summary"
            name="audience_summary"
            type="text"
            value={formData.audience?.summary || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                audience: { ...prev.audience, summary: e.target.value },
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Developers evaluating provenance tooling"
          />
        </div>

        <div>
          <label htmlFor="audience_interests" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Audience Interests (comma-separated)
          </label>
          <input
            id="audience_interests"
            name="audience_interests"
            type="text"
            value={formData.audience?.interests.join(", ") || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                audience: { ...prev.audience, interests: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) },
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="AI content, verification, provenance"
          />
        </div>

        <button
          type="submit"
          disabled={createProject.isPending}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createProject.isPending ? "Creating..." : "Create Project"}
        </button>
      </form>
    </section>
  );
}