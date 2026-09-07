import { NextRequest, NextResponse } from "next/server";

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

const mockRuns: VerificationRun[] = [
  {
    id: "run-1",
    project_id: "proj-1",
    asset_id: "asset-1",
    engine: "crex-verifier-v1",
    result: "BLOCK",
    finding_ids: ["find-1", "find-2"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  },
];

const mockFindings: VerificationFinding[] = [
  {
    id: "find-1",
    verification_run_id: "run-1",
    type: "SPONSOR_COMPLIANCE",
    severity: "BLOCK",
    reason: "Missing required sponsor disclosure 'Sponsored by TechBrand'",
    asset_id: "asset-1",
    component_id: "comp-1",
    generated_text: "The ProBook X1 battery lasts 10 hours.",
    source_text: "Sponsored by TechBrand. The ProBook X1 battery lasts approximately 10 hours.",
    evidence_ranges: [{ start: 0, end: 15 }],
    recommendation: "Add sponsor disclosure at the beginning of the content",
    created_at: new Date().toISOString(),
  },
  {
    id: "find-2",
    verification_run_id: "run-1",
    type: "SPONSOR_COMPLIANCE",
    severity: "BLOCK",
    reason: "Missing required discount code TECH20",
    asset_id: "asset-1",
    component_id: "comp-1",
    generated_text: "Get 20% off at techbrand.example/probook.",
    source_text: "Use code TECH20 at techbrand.example/probook for 20% off.",
    evidence_ranges: [{ start: 90, end: 105 }],
    recommendation: "Include the exact discount code TECH20",
    created_at: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");
  const assetId = searchParams.get("assetId");
  const runId = searchParams.get("runId");

  if (runId) {
    const findings = mockFindings.filter((f) => f.verification_run_id === runId);
    return NextResponse.json(findings);
  }

  if (!projectId || !assetId) {
    return NextResponse.json({ message: "Missing projectId or assetId" }, { status: 400 });
  }

  const filtered = mockRuns.filter((r) => r.project_id === projectId && r.asset_id === assetId);
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, assetId } = body;

  if (!projectId || !assetId) {
    return NextResponse.json({ message: "Missing projectId or assetId" }, { status: 400 });
  }

  const newRun: VerificationRun = {
    id: "run-" + Date.now(),
    project_id: projectId,
    asset_id: assetId,
    engine: "crex-verifier-v1",
    result: "BLOCK",
    finding_ids: ["find-1", "find-2"],
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };

  mockRuns.push(newRun);
  return NextResponse.json(newRun, { status: 201 });
}