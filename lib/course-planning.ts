import type { Course, CourseStatus } from "@/lib/types";

export interface CourseSemesterPatch {
  semester: string | null;
  status: CourseStatus;
}

export function getCourseStatusForSemester(course: Course, semesterId: string | null): CourseStatus {
  if (semesterId && course.status === "not_started") return "planned";
  if (!semesterId && course.status === "planned") return "not_started";
  return course.status;
}

export function buildCourseSemesterPatch(course: Course, semesterId: string | null): CourseSemesterPatch {
  return {
    semester: semesterId,
    status: getCourseStatusForSemester(course, semesterId),
  };
}

export function applyCourseSemester(course: Course, semesterId: string | null): Course {
  return {
    ...course,
    semester: semesterId ?? undefined,
    status: getCourseStatusForSemester(course, semesterId),
  };
}
