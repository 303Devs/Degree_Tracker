import { NextRequest, NextResponse } from "next/server";
import { ensureReferencedCourseStubs, readCourses, createCourse } from "@/lib/data";
import type { Course } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureReferencedCourseStubs();
    const courses = readCourses();
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

    if (!body.id || !body.number) {
      return NextResponse.json({ error: "id and number are required" }, { status: 400 });
    }

    const course: Course = {
      id: body.id,
      number: body.number,
      name: body.name ?? "",
      credits: body.credits ?? 3,
      prereqs: body.prereqs ?? null,
      coreqs: body.coreqs ?? null,
      status: body.status ?? "not_started",
      grade: body.grade,
      semester: body.semester,
      gradePoints: body.gradePoints,
      notes: body.notes,
      countedTowardDegree: body.countedTowardDegree ?? true,
      countsTowardGPA: body.countsTowardGPA ?? true,
      countsTowardEarnedHours: body.countsTowardEarnedHours ?? true,
      manuallyAdded: body.manuallyAdded ?? true,
      source: body.source ?? "manual",
    };

    const created = createCourse(course);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
