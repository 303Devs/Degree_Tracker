import { NextRequest, NextResponse } from "next/server";
import { resetDashboardActionState, updateDashboardActionState } from "@/lib/data";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { dismissed?: boolean; snoozedUntil?: string | null; reason?: string };
    const state = updateDashboardActionState(id, body);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: "Failed to update dashboard action state: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(resetDashboardActionState(id));
  } catch (err) {
    return NextResponse.json({ error: "Failed to reset dashboard action state: " + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
