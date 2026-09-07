import { NextRequest, NextResponse } from "next/server";
import { projectSchema } from "@crex/schemas";
import { randomUUID } from "node:crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    
    const project = projectSchema.parse({
      ...body,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: "List projects endpoint - implement with D1" });
}