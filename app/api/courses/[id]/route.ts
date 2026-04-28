import { NextRequest, NextResponse } from "next/server";
import { updateCourse, deleteCourse, getCourseById } from "@/lib/data";
import type { Course } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const course = getCourseById(id);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  return NextResponse.json(course);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = (await request.json()) as Partial<Course>;

    // Recalculate grade points if grade is being updated
    if (updates.grade !== undefined) {
      const GRADE_POINTS: Record<string, number> = {
        A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
        "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0,
      };
      updates.gradePoints = GRADE_POINTS[updates.grade] ?? undefined;
    }

    const updated = updateCourse(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update course: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteCourse(id);
    if (!deleted) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete course: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
