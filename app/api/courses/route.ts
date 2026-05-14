import { NextRequest, NextResponse } from "next/server";
import { ensureReferencedCourseStubs, readEffectiveCourses, createManualCourse } from "@/lib/data";
import type { Course } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureReferencedCourseStubs();
    const courses = readEffectiveCourses();
    return NextResponse.json(courses);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read courses: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Course>;
    const created = createManualCourse(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("already exists") ? 409 : msg.includes("required") || msg.includes("invalid") || msg.includes("must") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
