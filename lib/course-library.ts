import type { Course } from "@/lib/types";
import { NON_DEGREE_CREDIT_GRADES } from "@/lib/prereqs";

export type CourseLibrarySource = "Audit" | "Catalog" | "Manual";
export type CourseLibraryCounting = "Counts" | "Not counting" | "Not planned" | "Planned";

export interface CourseLibraryMeta {
  source: CourseLibrarySource;
  counting: CourseLibraryCounting;
}

function countsTowardDegree(course: Course): boolean {
  return (
    course.countedTowardDegree !== false &&
    !(course.status === "completed" && course.grade && NON_DEGREE_CREDIT_GRADES.has(course.grade))
  );
}

export function isCourseLibraryVisible(course: Course): boolean {
  return !course.id.endsWith("-0000");
}

function sourceLabel(course: Course): CourseLibrarySource {
  const source = course.source as string | undefined;
  if (source === "audit") return "Audit";
  if (source === "manual") return "Manual";
  if (source === "catalog" || source === "enriched" || source === "stub") return "Catalog";

  return course.status === "not_started" && !course.grade && !course.semester ? "Catalog" : "Audit";
}

export function getCourseLibraryMeta(course: Course): CourseLibraryMeta {
  const source = sourceLabel(course);

  let counting: CourseLibraryCounting;
  if (course.status === "planned" || course.status === "registered" || course.status === "in_progress") {
    counting = "Planned";
  } else if (course.status === "not_started") {
    counting = "Not planned";
  } else {
    counting = countsTowardDegree(course) ? "Counts" : "Not counting";
  }

  return { source, counting };
}
