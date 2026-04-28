import { NextRequest, NextResponse } from "next/server";
import { updateRequirement } from "@/lib/data";
import type { RequirementGroup } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = (await request.json()) as Partial<RequirementGroup>;

    const updated = updateRequirement(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Requirement group not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Failed to update requirement: " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 }
    );
  }
}
