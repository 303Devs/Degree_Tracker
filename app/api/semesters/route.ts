import { NextRequest, NextResponse } from "next/server";
import { readSemesters, readCourses, createSemester } from "@/lib/data";
import type { Semester } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const semesters = readSemesters();
    const courses = readCourses();

    // Enrich semesters with course details
    const enriched = semesters.map((sem) => ({
      ...sem,
      courseDetails: sem.courses
        .map((id) => courses.find((c) => c.id === id))
        .filter(Boolean),
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read semesters: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<Semester>;

    const { id, label, type, year, status } = body;
    if (!id || !label || !type || !year || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sem: Semester = { id, label, type, year, status, courses: [] };
    const created = createSemester(sem);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create semester: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
