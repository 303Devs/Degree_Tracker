import { NextRequest, NextResponse } from "next/server";
import { deleteEditableRequirement, updateEditableRequirement } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = (await request.json()) as Record<string, unknown>;

    const updated = updateEditableRequirement(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Requirement group not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = deleteEditableRequirement(id);
  if (!result.deleted) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
