import { NextRequest, NextResponse } from "next/server";

interface Evidence {
  id: string;
  claim_id: string;
  type: string;
  content: string;
  source_range: { start: number; end: number };
  created_at: string;
}

const mockEvidence: Evidence[] = [
  {
    id: "ev-1",
    claim_id: "claim-1",
    type: "TRANSCRIPT",
    content: "The ProBook X1 battery lasts approximately 10 hours under typical usage according to the manufacturer.",
    source_range: { start: 15, end: 45 },
    created_at: new Date().toISOString(),
  },
  {
    id: "ev-2",
    claim_id: "claim-2",
    type: "TRANSCRIPT",
    content: "In our testing, we got 9.5 hours of mixed workload which is close to the claim.",
    source_range: { start: 45, end: 75 },
    created_at: new Date().toISOString(),
  },
  {
    id: "ev-3",
    claim_id: "claim-3",
    type: "TRANSCRIPT",
    content: "The laptop costs $1,299 and comes with a 2-year warranty.",
    source_range: { start: 75, end: 90 },
    created_at: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const claimId = searchParams.get("claimId");

  if (!claimId) {
    return NextResponse.json({ message: "Missing claimId" }, { status: 400 });
  }

  const filtered = mockEvidence.filter((e) => e.claim_id === claimId);
  return NextResponse.json(filtered);
}