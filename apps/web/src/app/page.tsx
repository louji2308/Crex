"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectForm } from "@/components/ProjectForm";
import { SourceUpload } from "@/components/SourceUpload";
import { EvidenceExplorer } from "@/components/EvidenceExplorer";
import { VerificationPanel } from "@/components/VerificationPanel";
import { ReleasePassport } from "@/components/ReleasePassport";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const steps = [
  { id: "project", label: "Create Project", href: "#project" },
  { id: "upload", label: "Upload Source", href: "#upload" },
  { id: "evidence", label: "Evidence Graph", href: "#evidence" },
  { id: "verify", label: "Verify", href: "#verify" },
  { id: "passport", label: "Release Passport", href: "#passport" },
];

export default function HomePage() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Crex</h1>
              <nav className="hidden md:flex space-x-6">
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(index)}
                    className={`text-sm font-medium transition-colors ${
                      index === activeStep
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {step.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="md:hidden mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
            <div className="flex overflow-x-auto space-x-4 pb-2">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(index)}
                  className={`whitespace-nowrap text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                    index === activeStep
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          {activeStep === 0 && <ProjectForm />}
          {activeStep === 1 && <SourceUpload />}
          {activeStep === 2 && <EvidenceExplorer />}
          {activeStep === 3 && <VerificationPanel />}
          {activeStep === 4 && <ReleasePassport />}
        </main>

        <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Crex - AI Content Compiler with Provenance Tracking
            </p>
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}