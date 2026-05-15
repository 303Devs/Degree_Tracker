import { NextRequest, NextResponse } from "next/server";
import { enrichCoursesFromScraper, mergeAuditData, readEditState, writeEditState } from "@/lib/data";
import { applyReimportEditStateDecision, type ReimportApplyMode, type ReimportConflictDecision } from "@/lib/reimport-trust";
import type { ParsedAuditResult } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const requestBody = (await request.json()) as ParsedAuditResult | { audit: ParsedAuditResult; reimport?: { mode: ReimportApplyMode; decisions?: ReimportConflictDecision[]; confirmReset?: boolean } };
    const body = "audit" in requestBody ? requestBody.audit : requestBody;
    const reimport = "audit" in requestBody ? requestBody.reimport : undefined;

    if (!body || !body.requirementGroups || !body.courses) {
      return NextResponse.json({ error: "Invalid audit data" }, { status: 400 });
    }

    if (reimport?.mode === "reset_all" && !reimport.confirmReset) {
      return NextResponse.json({ error: "Resetting local edits requires explicit confirmation" }, { status: 400 });
    }

    if (reimport) {
      const editState = readEditState();
      writeEditState(applyReimportEditStateDecision({
        overrides: editState.overrides,
        manualEntities: editState.manualEntities,
        localStates: editState.localStates,
      }, reimport.mode, reimport.decisions ?? []));
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
