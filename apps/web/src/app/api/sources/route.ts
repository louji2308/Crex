import { NextRequest, NextResponse } from "next/server";

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

const mockSources: SourceAsset[] = [];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;

    if (!file || !projectId) {
      return NextResponse.json({ message: "Missing file or projectId" }, { status: 400 });
    }

    const source: SourceAsset = {
      id: randomUUID(),
      project_id: projectId,
      file_name: file.name,
      file_type: file.type,
      size_bytes: file.size,
      duration_seconds: 0,
      status: "READY",
      created_at: new Date().toISOString(),
    };

    mockSources.push(source);
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "Upload failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ message: "Missing projectId" }, { status: 400 });
  }

  const filtered = mockSources.filter((s) => s.project_id === projectId);
  return NextResponse.json(filtered);
}

function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}