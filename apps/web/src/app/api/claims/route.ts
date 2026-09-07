import { NextRequest, NextResponse } from "next/server";

interface Claim {
  id: string;
  project_id: string;
  segment_id: string;
  type: string;
  content: string;
  qualifiers: string[];
  created_at: string;
}

const mockClaims: Claim[] = [
  {
    id: "claim-1",
    project_id: "proj-1",
    segment_id: "seg-1",
    type: "CLAIM",
    content: "The ProBook X1 battery lasts approximately 10 hours under typical usage",
    qualifiers: ["approximately", "under typical usage"],
    created_at: new Date().toISOString(),
  },
  {
    id: "claim-2",
    project_id: "proj-1",
    segment_id: "seg-2",
    type: "CLAIM",
    content: "In testing we got 9.5 hours of mixed workload",
    qualifiers: ["in our testing", "mixed workload"],
    created_at: new Date().toISOString(),
  },
  {
    id: "claim-3",
    project_id: "proj-1",
    segment_id: "seg-3",
    type: "NUMERICAL",
    content: "The laptop costs $1,299",
    qualifiers: [],
    created_at: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ message: "Missing projectId" }, { status: 400 });
  }

  const filtered = mockClaims.filter((c) => c.project_id === projectId);
  return NextResponse.json(filtered);
}