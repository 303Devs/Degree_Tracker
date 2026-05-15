import { NextRequest, NextResponse } from "next/server";
import { readCourses, readEditState, readRequirements } from "@/lib/data";
import { buildReimportTrustPreview } from "@/lib/reimport-trust";
import type { ParsedAuditResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ParsedAuditResult;
    if (!body || !Array.isArray(body.courses) || !Array.isArray(body.requirementGroups)) {
      return NextResponse.json({ error: "Invalid audit data" }, { status: 400 });
    }

    const preview = buildReimportTrustPreview({
      currentCourses: readCourses(),
      currentRequirements: readRequirements(),
      incomingCourses: body.courses,
      incomingRequirements: body.requirementGroups,
      editState: readEditState(),
    });

    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to preview re-import trust state: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
