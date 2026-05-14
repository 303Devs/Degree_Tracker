import { NextRequest, NextResponse } from "next/server";
import { resetEditableRequirement } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { field?: string; fields?: string[]; all?: boolean };
    const requirement = resetEditableRequirement(id, body);
    if (!requirement) {
      return NextResponse.json({ error: "Requirement group not found" }, { status: 404 });
    }
    return NextResponse.json(requirement);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
