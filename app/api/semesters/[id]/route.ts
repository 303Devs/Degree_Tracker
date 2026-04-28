import { NextRequest, NextResponse } from "next/server";
import { updateSemester, deleteSemester } from "@/lib/data";
import type { Semester } from "@/lib/types";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = deleteSemester(id);
    if (!ok) return NextResponse.json({ error: "Semester not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete semester: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = (await request.json()) as Partial<Semester>;

    const updated = updateSemester(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Semester not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update semester: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
