import { NextRequest, NextResponse } from "next/server";
import { enrichCoursesFromScraper, mergeAuditData } from "@/lib/data";
import type { ParsedAuditResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ParsedAuditResult;

    if (!body || !body.requirementGroups || !body.courses) {
      return NextResponse.json({ error: "Invalid audit data" }, { status: 400 });
    }

    mergeAuditData({
      courses: body.courses,
      requirements: body.requirementGroups,
      semesters: body.semesters ?? [],
      programs: body.programInfo ? [body.programInfo] : [],
    });

    const { enriched } = enrichCoursesFromScraper();

    return NextResponse.json({ success: true, enriched });
  } catch (err) {
    console.error("Audit confirm error:", err);
    return NextResponse.json(
      { error: "Failed to save audit data: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
